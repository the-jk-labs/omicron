// SPDX-License-Identifier: AGPL-3.0-or-later
// The client talks to a real SMTP server on 127.0.0.1 — a small scripted one
// written here — so every assertion is about what actually crosses the wire.
// The TLS cases run a real handshake against a throwaway self-signed
// certificate minted with openssl; they are skipped where openssl is missing.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCACertificates, setDefaultCACertificates, TLSSocket } from "node:tls";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { sendSmtp, type SmtpOptions } from "@/lib/smtp.ts";

type Reply = string | string[] | null;
type Handler = (line: string, session: Session) => Reply;

// One client connection as the server sees it.
class Session {
  received: string[] = [];
  data = "";
  tls = false;
  #inData = false;
  #partial = "";

  constructor(
    public socket: Socket,
    private handler: Handler,
  ) {}

  send(reply: Reply) {
    if (reply === null) return;
    for (const line of Array.isArray(reply) ? reply : [reply]) this.socket.write(`${line}\r\n`);
  }

  feed(chunk: string) {
    this.#partial += chunk;
    let nl: number;
    while ((nl = this.#partial.indexOf("\r\n")) !== -1) {
      const line = this.#partial.slice(0, nl);
      this.#partial = this.#partial.slice(nl + 2);
      if (this.#inData) {
        if (line === ".") {
          this.#inData = false;
          this.send("250 2.0.0 queued");
        } else this.data += `${line}\r\n`;
        continue;
      }
      this.received.push(line);
      if (line === "DATA") this.#inData = true;
      this.send(this.handler(line, this));
    }
  }
}

let cert: { key: string; cert: string } | null = null;
let server: Server;
let port: number;
let session: Session;
let handler: Handler;
let greeting: string | null;

function hasOpenssl(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const TLS = hasOpenssl();

beforeAll(async () => {
  if (TLS) {
    const dir = mkdtempSync(join(tmpdir(), "omicron-smtp-"));
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
        "-keyout",
        join(dir, "key.pem"),
        "-out",
        join(dir, "cert.pem"),
      ],
      { stdio: "ignore" },
    );
    cert = { key: readFileSync(join(dir, "key.pem"), "utf8"), cert: readFileSync(join(dir, "cert.pem"), "utf8") };
    rmSync(dir, { recursive: true, force: true });
    // Trust it for this test process only, so the client's normal certificate
    // verification runs and passes.
    setDefaultCACertificates([...getCACertificates("default"), cert.cert]);
  }

  server = createServer((socket) => {
    session = new Session(socket, (line, s) => handler(line, s));
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => session.feed(chunk));
    socket.on("error", () => {});
    if (greeting) session.send(greeting);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  session?.socket.destroy();
});

// Upgrades the server side of the current session to TLS (after "220 ready").
function upgradeServerSide(s: Session) {
  const raw = s.socket;
  raw.removeAllListeners("data");
  const secure = new TLSSocket(raw, { isServer: true, key: cert!.key, cert: cert!.cert });
  secure.setEncoding("utf8");
  secure.on("data", (chunk: string) => s.feed(chunk));
  secure.on("error", () => {});
  s.socket = secure;
  s.tls = true;
}

// A well-behaved submission server: offers STARTTLS (when it can) and AUTH LOGIN.
function standard(overrides: Record<string, Reply> = {}): Handler {
  let authStep = 0;
  return (line, s) => {
    const verb = line.split(/[ :]/)[0].toUpperCase();
    if (authStep > 0) {
      authStep++;
      if (authStep === 2) return "334 UGFzc3dvcmQ6";
      authStep = 0;
      return overrides.AUTH_RESULT ?? "235 2.7.0 authenticated";
    }
    if (verb in overrides) return overrides[verb];
    switch (verb) {
      case "EHLO":
        return s.tls || !cert
          ? ["250-smtp.test", "250-AUTH LOGIN", "250 SIZE 1000"]
          : ["250-smtp.test", "250-STARTTLS", "250 SIZE 1000"];
      case "STARTTLS":
        setImmediate(() => upgradeServerSide(s));
        return "220 2.0.0 ready";
      case "AUTH":
        authStep = 1;
        return "334 VXNlcm5hbWU6";
      case "MAIL":
      case "RCPT":
        return "250 ok";
      case "DATA":
        return "354 go ahead";
      case "QUIT":
        return "221 bye";
      default:
        return "500 unknown";
    }
  };
}

function serve(h: Handler, greet: string | null = "220 smtp.test ESMTP") {
  handler = h;
  greeting = greet;
}

const opts = (o: Partial<SmtpOptions> = {}): SmtpOptions => ({
  hostname: "localhost",
  port,
  implicitTls: false,
  starttls: "never",
  heloName: "blog.example",
  timeoutMs: 2_000,
  ...o,
});

const env = (data = "Subject: hi\r\n\r\nbody\r\n") => ({
  from: "no-reply@blog.example",
  to: "ada@example.test",
  data: new TextEncoder().encode(data),
});

describe("plaintext submission", () => {
  test("speaks EHLO, MAIL, RCPT, DATA, QUIT in order and delivers the bytes", async () => {
    serve(standard());
    await sendSmtp(opts({ starttls: "never" }), env());
    expect(session.received).toEqual([
      "EHLO blog.example",
      "MAIL FROM:<no-reply@blog.example>",
      "RCPT TO:<ada@example.test>",
      "DATA",
      "QUIT",
    ]);
    expect(session.data).toBe("Subject: hi\r\n\r\nbody\r\n");
  });

  test("announces localhost when no HELO name is given", async () => {
    serve(standard());
    await sendSmtp(opts({ heloName: undefined }), env());
    expect(session.received[0]).toBe("EHLO localhost");
  });

  test("dot-stuffs lines that start with a period and terminates the data", async () => {
    serve(standard());
    await sendSmtp(opts(), env("Subject: x\r\n\r\n.hidden\r\n..two\r\nend"));
    // The test server strips the terminator but does not un-stuff.
    expect(session.data).toBe("Subject: x\r\n\r\n..hidden\r\n...two\r\nend\r\n");
  });

  test("reads multi-line replies", async () => {
    serve(standard({ EHLO: ["250-a", "250-b", "250-c", "250 d"] }));
    await expect(sendSmtp(opts(), env())).resolves.toBeUndefined();
  });

  test("opportunistic mode continues in plaintext when STARTTLS is not offered", async () => {
    serve(standard({ EHLO: ["250-mx.test", "250 SIZE 1000"] }));
    await sendSmtp(opts({ starttls: "opportunistic" }), env());
    expect(session.received).toContain("DATA");
  });

  test("refuses when STARTTLS is required but not offered", async () => {
    serve(standard({ EHLO: ["250-smtp.test", "250 SIZE 1000"] }));
    await expect(sendSmtp(opts({ starttls: "require" }), env())).rejects.toThrow("does not offer STARTTLS");
    expect(session.received).not.toContain("DATA");
  });

  test("never sends credentials in plaintext", async () => {
    serve(standard({ EHLO: ["250-smtp.test", "250 AUTH LOGIN"] }));
    await expect(sendSmtp(opts({ username: "u", password: "p" }), env())).rejects.toThrow(
      "Refusing to send SMTP credentials over an unencrypted connection.",
    );
    expect(session.received).not.toContain(btoa("p"));
  });
});

describe("errors", () => {
  test("reports a connection failure with the target", async () => {
    const closed = createServer();
    await new Promise<void>((r) => closed.listen(0, "127.0.0.1", r));
    const deadPort = (closed.address() as { port: number }).port;
    await new Promise((r) => closed.close(r));
    await expect(sendSmtp(opts({ hostname: "127.0.0.1", port: deadPort }), env())).rejects.toThrow(
      `Could not connect to 127.0.0.1:${deadPort}`,
    );
  });

  test("surfaces an unexpected reply code with the server's text", async () => {
    serve(standard({ MAIL: "550 5.7.1 sender rejected" }));
    await expect(sendSmtp(opts(), env())).rejects.toThrow("SMTP: expected 250, got 550 5.7.1 sender rejected");
  });

  test("accepts 251 (will forward) for the recipient", async () => {
    serve(standard({ RCPT: "251 user not local; will forward" }));
    await expect(sendSmtp(opts(), env())).resolves.toBeUndefined();
  });

  test("a rejected recipient is a precise error", async () => {
    serve(standard({ RCPT: "550 5.1.1 no such user" }));
    await expect(sendSmtp(opts(), env())).rejects.toThrow("Recipient rejected: 550 5.1.1 no such user");
  });

  test("a bad greeting fails before EHLO", async () => {
    serve(standard(), "554 go away");
    await expect(sendSmtp(opts(), env())).rejects.toThrow("expected 220, got 554");
    expect(session.received).toEqual([]);
  });

  test("a server hanging up mid-conversation is reported", async () => {
    serve((line, s) => {
      if (line.startsWith("EHLO")) s.socket.end();
      return null;
    });
    await expect(sendSmtp(opts(), env())).rejects.toThrow("SMTP connection closed by server");
  });

  test("times out a silent server", async () => {
    serve(() => null, null);
    await expect(sendSmtp(opts({ timeoutMs: 100 }), env())).rejects.toThrow("SMTP timeout");
  });

  test("a failed QUIT after acceptance still counts as delivered", async () => {
    serve(standard({ QUIT: "500 whatever" }));
    await expect(sendSmtp(opts(), env())).resolves.toBeUndefined();
  });

  test.for([
    ["from", "a@x.test\r\nRCPT TO:<victim@x.test>"],
    ["to", "b@x.test\nDATA"],
    ["to", "b@x.test\x00"],
  ] as const)("refuses a control character in the %s address before connecting", async ([field, value]) => {
    serve(standard());
    await expect(sendSmtp(opts({ port: 1 }), { ...env(), [field]: value })).rejects.toThrow(
      "Illegal control character",
    );
  });
});

describe.skipIf(!TLS)("TLS", () => {
  test("upgrades with STARTTLS, re-EHLOs, authenticates and submits", async () => {
    serve(standard());
    await sendSmtp(opts({ starttls: "require", username: "user", password: "pass" }), env());
    expect(session.tls).toBe(true);
    expect(session.received).toEqual([
      "EHLO blog.example",
      "STARTTLS",
      "EHLO blog.example",
      "AUTH LOGIN",
      btoa("user"),
      btoa("pass"),
      "MAIL FROM:<no-reply@blog.example>",
      "RCPT TO:<ada@example.test>",
      "DATA",
      "QUIT",
    ]);
    expect(session.data).toBe("Subject: hi\r\n\r\nbody\r\n");
  });

  test("a wrong password fails at AUTH", async () => {
    serve(standard({ AUTH_RESULT: "535 5.7.8 bad credentials" }));
    await expect(sendSmtp(opts({ starttls: "require", username: "u", password: "wrong" }), env())).rejects.toThrow(
      "expected 235, got 535",
    );
  });

  test("refuses a certificate for another host", async () => {
    serve(standard());
    await expect(sendSmtp(opts({ hostname: "127.0.0.1", starttls: "require" }), env())).rejects.toThrow(
      /TLS negotiation with 127\.0\.0\.1 failed/,
    );
  });

  // BUG: AUTH LOGIN encodes the credentials with btoa(), which only accepts
  // Latin-1. A password containing any other character (Azerbaijani "ə", an
  // emoji, …) throws InvalidCharacterError instead of authenticating; RFC 4954
  // expects the UTF-8 bytes base64-encoded.
  test.fails("BUG: authenticates with a non-Latin-1 password", async () => {
    serve(standard());
    await sendSmtp(opts({ starttls: "require", username: "user", password: "şifrə-🔑" }), env());
    const utf8 = btoa(String.fromCharCode(...new TextEncoder().encode("şifrə-🔑")));
    expect(session.received).toContain(utf8);
  });
});
