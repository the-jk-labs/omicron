// SPDX-License-Identifier: AGPL-3.0-or-later
// The SMTP wire protocol is covered against a real server in
// tests/lib/smtp.test.ts; here sendSmtp is the boundary, so these tests are
// about which transport runs, what envelope and bytes it is handed, and what
// the templates say.
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/lib/smtp.ts"));
vi.mock(import("@/services/emailSettings.ts"));
vi.mock(import("@/services/instanceSetup.ts"));
vi.mock(import("node:dns/promises"), () => ({
  resolveMx: vi.fn<(host: string) => Promise<{ exchange: string; priority: number }[]>>(),
}));

import { resolveMx } from "node:dns/promises";
import { sendSmtp } from "@/lib/smtp.ts";
import { type DkimKeyPair, generateKeyPair, verifyOwn } from "@/services/dkim.ts";
import * as email from "@/services/email.ts";
import type { EmailConfig } from "@/services/emailSettings.ts";
import { getEmailConfig } from "@/services/emailSettings.ts";
import { getAppName, getOrigin } from "@/services/instanceSetup.ts";

let keys: DkimKeyPair;

beforeAll(async () => {
  keys = await generateKeyPair();
});

function cfg(overrides: Partial<EmailConfig> = {}): EmailConfig {
  return {
    mode: "console",
    from: "Blog <noreply@blog.example>",
    smtp: { host: "smtp.example", port: 587, username: "u", password: "p", tls: false },
    relay: { provider: "resend", apiKey: "re_key" },
    dkim: { domain: undefined, selector: "omicron", privateKey: undefined, publicKey: undefined },
    ...overrides,
  };
}

const msg = { to: "Ada <ada@example.test>", subject: "Hi", text: "plain", html: "<p>rich</p>" };

// Splits the serialized message the transport handed over.
function parse(data: Uint8Array) {
  const raw = new TextDecoder().decode(data);
  const [head, ...rest] = raw.split("\r\n\r\n");
  const headers = head.split("\r\n").map((l): [string, string] => {
    const i = l.indexOf(": ");
    return [l.slice(0, i), l.slice(i + 2)];
  });
  return { headers, body: rest.join("\r\n\r\n") };
}

beforeEach(() => {
  vi.mocked(getOrigin).mockResolvedValue("https://blog.example");
  vi.mocked(sendSmtp).mockResolvedValue();
});

describe("transport selection", () => {
  test("console logs the message (with its link) instead of sending it", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg());
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await email.sendPasswordReset("ada@example.test", "https://blog.example/reset?token=abc");
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("To:      ada@example.test");
    expect(out).toContain("https://blog.example/reset?token=abc");
    expect(sendSmtp).not.toHaveBeenCalled();
  });

  test("smtp submits to the configured server with STARTTLS required", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "smtp" }));
    await email.sendMail(msg);
    const [opts, envelope] = vi.mocked(sendSmtp).mock.calls[0];
    expect(opts).toEqual({
      hostname: "smtp.example",
      port: 587,
      implicitTls: false,
      starttls: "require",
      username: "u",
      password: "p",
      heloName: "blog.example",
    });
    expect(envelope.from).toBe("noreply@blog.example");
    expect(envelope.to).toBe("ada@example.test");
    const { headers } = parse(envelope.data);
    expect(headers).toContainEqual(["To", "Ada <ada@example.test>"]);
    expect(headers.some(([n]) => n === "DKIM-Signature")).toBe(false);
  });

  test("smtp with implicit TLS never asks for STARTTLS", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(
      cfg({ mode: "smtp", smtp: { host: "smtp.example", port: 465, tls: true } }),
    );
    await email.sendMail(msg);
    expect(vi.mocked(sendSmtp).mock.calls[0][0]).toMatchObject({ implicitTls: true, starttls: "never", port: 465 });
  });

  test("smtp without a host is a clear error", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "smtp", smtp: { port: 587, tls: false } }));
    await expect(email.sendMail(msg)).rejects.toThrow("Email mode is SMTP but no SMTP host is configured.");
  });

  test("DKIM-signs when a key matches the From domain, and the signature verifies", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(
      cfg({
        mode: "smtp",
        dkim: { domain: "blog.example", selector: "omicron", privateKey: keys.privateKey, publicKey: keys.publicKey },
      }),
    );
    await email.sendMail(msg);
    const { headers, body } = parse(vi.mocked(sendSmtp).mock.calls[0][1].data);
    const [name, value] = headers[0];
    expect(name).toBe("DKIM-Signature");
    expect(await verifyOwn(headers.slice(1), body, `${name}: ${value}`, keys.publicKey)).toBe(true);
  });

  test("never signs with a key for another domain", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(
      cfg({
        mode: "smtp",
        dkim: { domain: "other.example", selector: "omicron", privateKey: keys.privateKey, publicKey: keys.publicKey },
      }),
    );
    await email.sendMail(msg);
    const { headers } = parse(vi.mocked(sendSmtp).mock.calls[0][1].data);
    expect(headers.some(([n]) => n === "DKIM-Signature")).toBe(false);
  });

  test("relay posts to Resend with the bare recipient", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "relay" }));
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await email.sendMail(msg);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer re_key");
    expect(JSON.parse(init!.body as string)).toEqual({
      from: "Blog <noreply@blog.example>",
      to: ["ada@example.test"],
      subject: "Hi",
      text: "plain",
      html: "<p>rich</p>",
    });
  });

  test("relay surfaces the provider's error, truncated", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "relay" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(1000), { status: 422 }));
    await expect(email.sendMail(msg)).rejects.toThrow(`Relay (resend) returned 422: ${"x".repeat(300)}`);
  });

  test("relay refuses without a key or with an unknown provider", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "relay", relay: { provider: "resend" } }));
    await expect(email.sendMail(msg)).rejects.toThrow("no API key");
    vi.mocked(getEmailConfig).mockResolvedValue(
      cfg({ mode: "relay", relay: { provider: "mailgun" as never, apiKey: "k" } }),
    );
    await expect(email.sendMail(msg)).rejects.toThrow('Unsupported relay provider: "mailgun"');
  });

  test("direct delivers to the lowest-priority MX on port 25 with opportunistic TLS", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "direct" }));
    vi.mocked(resolveMx).mockResolvedValue([
      { exchange: "mx2.example.test", priority: 20 },
      { exchange: "mx1.example.test", priority: 10 },
    ]);
    await email.sendMail(msg);
    expect(resolveMx).toHaveBeenCalledWith("example.test");
    expect(vi.mocked(sendSmtp).mock.calls).toHaveLength(1);
    expect(vi.mocked(sendSmtp).mock.calls[0][0]).toMatchObject({
      hostname: "mx1.example.test",
      port: 25,
      implicitTls: false,
      starttls: "opportunistic",
    });
  });

  test("direct falls through to the next MX and reports every failure", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "direct" }));
    vi.mocked(resolveMx).mockResolvedValue([
      { exchange: "mx1.example.test", priority: 10 },
      { exchange: "mx2.example.test", priority: 20 },
    ]);
    vi.mocked(sendSmtp).mockRejectedValueOnce(new Error("421 try later"));
    await email.sendMail(msg);
    expect(vi.mocked(sendSmtp).mock.calls.map(([o]) => o.hostname)).toEqual(["mx1.example.test", "mx2.example.test"]);

    vi.mocked(sendSmtp).mockRejectedValue(new Error("refused"));
    await expect(email.sendMail(msg)).rejects.toThrow(
      "Direct delivery to example.test failed. Tried: mx1.example.test: refused; mx2.example.test: refused",
    );
  });

  test("direct reports a domain without MX records", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "direct" }));
    vi.mocked(resolveMx).mockRejectedValue(new Error("queryMx ENOTFOUND"));
    await expect(email.sendMail(msg)).rejects.toThrow("No MX records for example.test: queryMx ENOTFOUND");
    vi.mocked(resolveMx).mockResolvedValue([]);
    await expect(email.sendMail(msg)).rejects.toThrow("No MX records for example.test");
  });

  test("direct refuses a recipient without a domain", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "direct" }));
    await expect(email.sendMail({ ...msg, to: "nobody" })).rejects.toThrow("Invalid recipient address: nobody");
  });

  test("sendTestEmail uses unsaved settings when given and links the instance", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg());
    await email.sendTestEmail("ada@example.test", cfg({ mode: "smtp" }));
    expect(getEmailConfig).not.toHaveBeenCalled();
    const { body } = parse(vi.mocked(sendSmtp).mock.calls[0][1].data);
    expect(body).toContain("Content-Type: text/html");
  });
});

const vars = { username: "ada", appName: "My Blog", origin: "https://blog.example" };

describe("templates", () => {
  test.for([
    ["accountPasswordChangedEmail", "Your My Blog password was changed", "https://blog.example/forgot-password"],
    ["accountErasedEmail", "Your My Blog account has been permanently deleted", "https://blog.example"],
    ["accountSuspendedEmail", "Your My Blog account has been suspended", "https://blog.example"],
    ["accountReinstatedEmail", "Your My Blog account has been reinstated", "https://blog.example/login"],
    ["accountRestoredEmail", "Your My Blog account has been restored", "https://blog.example/login"],
    ["accountAdminGrantedEmail", "You are now an admin on My Blog", "https://blog.example/admin"],
    ["accountAdminRevokedEmail", "Your My Blog admin role has been removed", "https://blog.example"],
    ["accountModeratorGrantedEmail", "You are now a moderator on My Blog", "https://blog.example/admin"],
    ["accountModeratorRevokedEmail", "Your My Blog moderator role has been removed", "https://blog.example"],
    ["accountVerifiedEmail", "Your My Blog email has been verified", "https://blog.example/login"],
  ] as const)("%s names the instance and links to %s", ([fn, subject, link]) => {
    const m = email[fn](vars);
    expect(m.subject).toBe(subject);
    expect(m.text).toContain("@ada");
    expect(m.text).toContain(link);
    expect(m.html).toContain(`href="${link}"`);
  });

  test("the deletion notice shows only the calendar day of the deadline", () => {
    const m = email.accountDeletedEmail({ ...vars, expiresAt: "2026-07-01T13:45:00.000Z" });
    expect(m.text).toContain("Your data is kept until 2026-07-01.");
    expect(m.text).not.toContain("13:45");
  });

  test("the post-removed notice names the post", () => {
    const m = email.accountPostRemovedEmail({ ...vars, postTitle: "Hello" });
    expect(m.subject).toBe("Your My Blog post was removed");
    expect(m.text).toContain('"Hello"');
  });

  test.for([
    ["accountPasskeyAddedEmail", "A passkey was added to your My Blog account", "was just added"],
    ["accountPasskeyRemovedEmail", "A passkey was removed from your My Blog account", "was just removed"],
  ] as const)("%s names the passkey and links to the passkey settings", ([fn, subject, change]) => {
    const m = email[fn]({ ...vars, passkeyName: "Laptop" });
    expect(m.subject).toBe(subject);
    expect(m.text).toContain(`A passkey ("Laptop") ${change}`);
    expect(m.text).toContain("@ada");
    expect(m.text).toContain("https://blog.example/settings?tab=account#passkeys");
    expect(m.html).toContain('href="https://blog.example/settings?tab=account#passkeys"');
  });

  test("a passkey notice reads naturally without a name, and escapes one in HTML", () => {
    expect(email.accountPasskeyAddedEmail({ ...vars, passkeyName: null }).text).toMatch(/^A passkey was just added/);
    const m = email.accountPasskeyRemovedEmail({ ...vars, passkeyName: "<b>evil</b>" });
    expect(m.html).not.toContain("<b>evil</b>");
  });

  test("the email-changed notice names the new address", () => {
    expect(email.accountEmailChangedEmail({ ...vars, newEmail: "new@x.test" }).text).toContain("new@x.test");
  });

  test("every send* helper delivers its template", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "smtp" }));
    const senders: [keyof typeof email, unknown][] = [
      ["sendAccountDeleted", { ...vars, expiresAt: "2026-07-01T00:00:00Z" }],
      ["sendPasswordChanged", vars],
      ["sendAccountErased", vars],
      ["sendAccountSuspended", vars],
      ["sendAccountReinstated", vars],
      ["sendAccountRestored", vars],
      ["sendAdminGranted", vars],
      ["sendAdminRevoked", vars],
      ["sendModeratorGranted", vars],
      ["sendModeratorRevoked", vars],
      ["sendPostRemoved", { ...vars, postTitle: "T" }],
      ["sendAccountVerified", vars],
      ["sendAccountEmailChanged", { ...vars, newEmail: "n@x.test" }],
      ["sendPasskeyAdded", { ...vars, passkeyName: "Laptop" }],
      ["sendPasskeyRemoved", { ...vars, passkeyName: null }],
    ];
    for (const [fn, v] of senders) await (email[fn] as (to: string, v: unknown) => Promise<void>)("a@x.test", v);
    await email.sendEmailVerification("a@x.test", "https://blog.example/verify?t=1");
    expect(sendSmtp).toHaveBeenCalledTimes(senders.length + 1);
  });

  test("escapes the post title in the HTML of the removal notice", () => {
    const m = email.accountPostRemovedEmail({ ...vars, postTitle: '<a href="https://evil.example">Restore</a>' });
    expect(m.html).not.toContain('<a href="https://evil.example">');
  });

  test("the password-reset email names the instance, not the software", async () => {
    vi.mocked(getEmailConfig).mockResolvedValue(cfg({ mode: "smtp" }));
    vi.mocked(getOrigin).mockResolvedValue("https://blog.example");
    vi.mocked(getAppName).mockResolvedValue("My Blog");
    await email.sendPasswordReset("a@x.test", "https://blog.example/r");
    const { headers } = parse(vi.mocked(sendSmtp).mock.calls[0][1].data);
    expect(headers.find(([n]) => n === "Subject")?.[1]).toBe("Reset your My Blog password");
  });
});
