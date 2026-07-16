// SPDX-License-Identifier: AGPL-3.0-or-later

// A minimal, fully-controlled SMTP client. We deliberately don't use a
// third-party mailer: owning the wire protocol lets us (a) give precise errors
// instead of a library's misleading ones, (b) never leak background promise
// rejections, and (c) send the exact bytes we sign for DKIM (so the body hash
// matches). It speaks just enough SMTP to submit one message: EHLO, optional
// STARTTLS, optional AUTH, MAIL/RCPT/DATA.

export interface SmtpOptions {
  hostname: string;
  port: number;
  /** Connect with TLS immediately (implicit TLS, port 465). */
  implicitTls: boolean;
  /**
   * STARTTLS policy for a plaintext connection:
   *  - "require": fail unless the connection is encrypted (configured servers).
   *  - "opportunistic": upgrade if offered, else continue plaintext (MX delivery).
   *  - "never": stay plaintext (local test sinks).
   */
  starttls: "require" | "opportunistic" | "never";
  username?: string;
  password?: string;
  /** EHLO name we announce. */
  heloName?: string;
  /** Per-step socket timeout. */
  timeoutMs?: number;
}

export interface SmtpEnvelope {
  /** Bare return-path address (no display name). */
  from: string;
  /** Bare recipient address (no display name). */
  to: string;
  /** Full RFC 5322 message (headers + CRLF CRLF + body), CRLF line endings. */
  data: Uint8Array;
}

const CRLF = "\r\n";
const encoder = new TextEncoder();

/** One reply from the server: numeric code plus the joined text lines. */
interface Reply {
  code: number;
  text: string;
}

// Buffered line reader over a Deno connection. SMTP replies are CRLF-delimited;
// a multiline reply repeats the code with "-" until a final "code<space>".
class SmtpConn {
  #conn: Deno.Conn;
  #buf = new Uint8Array(0);
  #dec = new TextDecoder();
  timeoutMs: number;

  constructor(conn: Deno.Conn, timeoutMs: number) {
    this.#conn = conn;
    this.timeoutMs = timeoutMs;
  }

  get raw(): Deno.Conn {
    return this.#conn;
  }

  replace(conn: Deno.Conn) {
    this.#conn = conn;
  }

  async #withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("SMTP timeout")), this.timeoutMs);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async #readMore(): Promise<void> {
    const chunk = new Uint8Array(4096);
    const n = await this.#withTimeout(this.#conn.read(chunk));
    if (n === null) throw new Error("SMTP connection closed by server");
    const next = new Uint8Array(this.#buf.length + n);
    next.set(this.#buf);
    next.set(chunk.subarray(0, n), this.#buf.length);
    this.#buf = next;
  }

  async #readLine(): Promise<string> {
    while (true) {
      const nl = this.#buf.indexOf(0x0a);
      if (nl !== -1) {
        const line = this.#dec.decode(this.#buf.subarray(0, nl)).replace(/\r$/, "");
        this.#buf = this.#buf.subarray(nl + 1);
        return line;
      }
      await this.#readMore();
    }
  }

  /** Read a full (possibly multiline) reply and assert its code if given. */
  async read(expect?: number): Promise<Reply> {
    const lines: string[] = [];
    let code = 0;
    while (true) {
      const line = await this.#readLine();
      code = Number(line.slice(0, 3));
      lines.push(line.slice(4));
      // "250-" means more lines follow; "250 " is the last.
      if (line.length < 4 || line[3] !== "-") break;
    }
    const reply = { code, text: lines.join(" ") };
    if (expect !== undefined && reply.code !== expect) {
      throw new Error(`SMTP: expected ${expect}, got ${reply.code} ${reply.text}`);
    }
    return reply;
  }

  async write(line: string): Promise<void> {
    await this.#withTimeout(writeAll(this.#conn, encoder.encode(line + CRLF)));
  }

  async writeBytes(bytes: Uint8Array): Promise<void> {
    await this.#withTimeout(writeAll(this.#conn, bytes));
  }

  close() {
    try {
      this.#conn.close();
    } catch { /* already closed */ }
  }
}

async function writeAll(conn: Deno.Conn, data: Uint8Array): Promise<void> {
  let off = 0;
  while (off < data.length) {
    off += await conn.write(data.subarray(off));
  }
}

// Dot-stuffing per RFC 5321 §4.5.2: a line starting with "." gets an extra ".".
// The message terminator is CRLF "." CRLF.
function dotStuff(data: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(data);
  const stuffed = text.replace(/\r\n\./g, "\r\n..");
  const withDot = (stuffed.endsWith(CRLF) ? stuffed : stuffed + CRLF) + "." + CRLF;
  return encoder.encode(withDot);
}

/** Submit one message over SMTP. Throws a precise error on any failure. */
export async function sendSmtp(opts: SmtpOptions, env: SmtpEnvelope): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const helo = opts.heloName || "localhost";

  let socket: Deno.Conn;
  try {
    socket = opts.implicitTls
      ? await Deno.connectTls({ hostname: opts.hostname, port: opts.port })
      : await Deno.connect({ hostname: opts.hostname, port: opts.port });
  } catch (err) {
    throw new Error(
      `Could not connect to ${opts.hostname}:${opts.port} — ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  const conn = new SmtpConn(socket, timeoutMs);
  let secure = opts.implicitTls;

  try {
    await conn.read(220);

    const ehlo = async (): Promise<string> => {
      await conn.write(`EHLO ${helo}`);
      return (await conn.read(250)).text.toUpperCase();
    };
    let caps = await ehlo();

    // STARTTLS upgrade for a plaintext connection.
    if (!secure && opts.starttls !== "never") {
      if (caps.includes("STARTTLS")) {
        await conn.write("STARTTLS");
        await conn.read(220);
        try {
          const tls = await Deno.startTls(conn.raw as Deno.TcpConn, { hostname: opts.hostname });
          conn.replace(tls);
          secure = true;
          caps = await ehlo(); // capabilities may change after TLS
        } catch (err) {
          if (opts.starttls === "require") {
            throw new Error(
              `TLS negotiation with ${opts.hostname} failed: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
          // Opportunistic: the TLS session is unusable; nothing more we can do on
          // this socket, so surface it (the caller may retry a next MX).
          throw new Error(
            `STARTTLS with ${opts.hostname} failed (opportunistic): ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      } else if (opts.starttls === "require") {
        throw new Error(
          `${opts.hostname} does not offer STARTTLS, but an encrypted connection is required. ` +
            `Use a server/port that supports TLS (587 with STARTTLS, or 465 for implicit TLS).`,
        );
      }
    }

    // AUTH — only ever over an encrypted link.
    if (opts.username && opts.password) {
      if (!secure) {
        throw new Error(
          "Refusing to send SMTP credentials over an unencrypted connection. " +
            "Use STARTTLS (587) or implicit TLS (465).",
        );
      }
      await conn.write("AUTH LOGIN");
      await conn.read(334);
      await conn.write(btoa(opts.username));
      await conn.read(334);
      await conn.write(btoa(opts.password));
      await conn.read(235);
    }

    await conn.write(`MAIL FROM:<${env.from}>`);
    await conn.read(250);
    await conn.write(`RCPT TO:<${env.to}>`);
    // 250 accepted, 251 will-forward.
    const rcpt = await conn.read();
    if (rcpt.code !== 250 && rcpt.code !== 251) {
      throw new Error(`Recipient rejected: ${rcpt.code} ${rcpt.text}`);
    }
    await conn.write("DATA");
    await conn.read(354);
    await conn.writeBytes(dotStuff(env.data));
    await conn.read(250);
    try {
      await conn.write("QUIT");
      await conn.read();
    } catch { /* server may drop the socket on QUIT; the message is already accepted */ }
  } finally {
    conn.close();
  }
}
