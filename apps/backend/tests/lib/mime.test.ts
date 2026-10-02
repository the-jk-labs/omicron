// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { buildMessage, domainOf, extractAddress, serializeMessage } from "@/lib/mime.ts";

// Header injection: a CR/LF in an address or subject must be refused, never
// serialized into a header line. Defense-in-depth backing the email validation
// upstream (Better Auth's sign-up, the setup wizard).
test("buildMessage rejects a newline in the recipient", () => {
  expect(() =>
    buildMessage({
      from: "Omicron <no-reply@example.com>",
      to: "victim@example.com\r\nBcc: attacker@evil.example",
      subject: "Hello",
      text: "body",
    }),
  ).toThrow("control character");
});

test("buildMessage rejects a newline in the sender", () => {
  expect(() =>
    buildMessage({
      from: "no-reply@example.com\nInjected: yes",
      to: "user@example.com",
      subject: "Hello",
      text: "body",
    }),
  ).toThrow("control character");
});

test("buildMessage rejects a newline in the subject", () => {
  expect(() =>
    buildMessage({
      from: "no-reply@example.com",
      to: "user@example.com",
      subject: "Hello\r\nX-Injected: 1",
      text: "body",
    }),
  ).toThrow("control character");
});

test("buildMessage accepts a well-formed message", () => {
  const { headers, fromAddress } = buildMessage({
    from: "Omicron <no-reply@example.com>",
    to: "user@example.com",
    subject: "Reset your password",
    text: "body",
  });
  const rendered = headers.map(([n, v]) => `${n}: ${v}`).join("\n");
  expect(rendered).toContain("To: user@example.com");
  expect(rendered).toContain("Subject: Reset your password");
  // The body carries a newline (base64 line wrapping) but that is not a header,
  // so it is unaffected by the header guard.
  expect(fromAddress).toBe("no-reply@example.com");
});

test("extractAddress pulls the bare address from a display-name form", () => {
  expect(extractAddress("Omicron <no-reply@example.com>")).toBe("no-reply@example.com");
});

function decodeBase64Lines(b64: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\r\n/g, "")), (c) => c.charCodeAt(0)));
}

test("buildMessage: a text-only message is single-part base64", () => {
  const { headers, body } = buildMessage({ from: "a@example.com", to: "b@example.com", subject: "S", text: "héllo" });
  expect(headers).toContainEqual(["Content-Type", "text/plain; charset=utf-8"]);
  expect(headers).toContainEqual(["Content-Transfer-Encoding", "base64"]);
  expect(body.endsWith("\r\n")).toBe(true);
  expect(decodeBase64Lines(body.trim())).toBe("héllo");
});

test("buildMessage: an HTML message is multipart/alternative with both parts", () => {
  const { headers, body } = buildMessage({
    from: "a@example.com",
    to: "b@example.com",
    subject: "S",
    text: "plain",
    html: "<p>rich</p>",
  });
  const ct = headers.find(([n]) => n === "Content-Type")![1];
  const boundary = ct.match(/boundary="([^"]+)"/)![1];
  expect(ct.startsWith("multipart/alternative")).toBe(true);
  expect(boundary).toMatch(/^omi_[0-9a-f]{32}$/);
  const parts = body.split(`--${boundary}`);
  // preamble, text part, html part, closing "--\r\n"
  expect(parts).toHaveLength(4);
  expect(parts[1]).toContain("Content-Type: text/plain; charset=utf-8");
  expect(parts[2]).toContain("Content-Type: text/html; charset=utf-8");
  expect(decodeBase64Lines(parts[1].split("\r\n\r\n")[1])).toBe("plain");
  expect(decodeBase64Lines(parts[2].split("\r\n\r\n")[1])).toBe("<p>rich</p>");
  expect(parts[3]).toBe("--\r\n");
});

test("buildMessage: wraps base64 lines at 76 characters", () => {
  const { body } = buildMessage({ from: "a@example.com", to: "b@example.com", subject: "S", text: "x".repeat(500) });
  const lines = body.trim().split("\r\n");
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines) expect(line.length).toBeLessThanOrEqual(76);
});

test("buildMessage: carries Date, Message-ID and MIME-Version headers", () => {
  const { headers } = buildMessage({
    from: "Omicron <x@Mail.Example.com>",
    to: "b@example.com",
    subject: "S",
    text: "t",
  });
  const get = (n: string) => headers.find(([h]) => h === n)?.[1];
  expect(get("MIME-Version")).toBe("1.0");
  expect(get("Date")).toMatch(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
  expect(get("Message-ID")).toMatch(/^<[0-9a-f-]{36}@mail\.example\.com>$/);
});

test("buildMessage: a sender without a domain falls back to localhost for the Message-ID", () => {
  const { headers, fromAddress } = buildMessage({ from: "postmaster", to: "b@example.com", subject: "S", text: "t" });
  expect(fromAddress).toBe("postmaster");
  expect(headers.find(([h]) => h === "Message-ID")?.[1]).toMatch(/@localhost>$/);
});

test("buildMessage: rejects a tab or DEL in a header value too", () => {
  expect(() => buildMessage({ from: "a@example.com", to: "b@example.com", subject: "a\tb", text: "" })).toThrow(
    "control character",
  );
  expect(() => buildMessage({ from: "a@example.com", to: "b@example.com", subject: "a\x7fb", text: "" })).toThrow(
    "control character",
  );
});

test("extractAddress: returns a bare address trimmed", () => {
  expect(extractAddress("  user@example.com ")).toBe("user@example.com");
});

test("domainOf: lower-cases the domain and is empty without one", () => {
  expect(domainOf("User@Example.COM")).toBe("example.com");
  expect(domainOf("nobody")).toBe("");
});

test("serializeMessage: joins headers and body with CRLF and a blank line", () => {
  const bytes = serializeMessage(
    [
      ["From", "a@example.com"],
      ["To", "b@example.com"],
    ],
    "BODY",
  );
  expect(new TextDecoder().decode(bytes)).toBe("From: a@example.com\r\nTo: b@example.com\r\n\r\nBODY");
});

test("encodes a non-ASCII subject so the header stays ASCII", () => {
  const { headers } = buildMessage({
    from: "Ömicron <no-reply@example.com>",
    to: "b@example.com",
    subject: "Your Ömicron password was changed",
    text: "t",
  });
  for (const [, value] of headers) expect(value).toMatch(/^[\x20-\x7e]*$/);
});

// RFC 2047 caps an encoded-word at 75 characters, so a long subject is split.
test("a long non-ASCII subject becomes encoded-words that decode back to it", () => {
  const subject = "Ölçü ".repeat(30).trim();
  const value = buildMessage({ from: "a@example.com", to: "b@example.com", subject, text: "t" }).headers.find(
    ([name]) => name === "Subject",
  )![1];
  const words = value.split(" ");
  for (const w of words) expect(w.length).toBeLessThanOrEqual(75);
  const bytes = words.flatMap((w) => Array.from(atob(w.slice(10, -2)), (c) => c.charCodeAt(0)));
  expect(new TextDecoder().decode(new Uint8Array(bytes))).toBe(subject);
});

test("an ASCII From and subject are written as-is", () => {
  const { headers } = buildMessage({
    from: '"Ada, Inc." <a@example.com>',
    to: "b@example.com",
    subject: "Hi",
    text: "t",
  });
  expect(headers.slice(0, 3)).toEqual([
    ["From", '"Ada, Inc." <a@example.com>'],
    ["To", "b@example.com"],
    ["Subject", "Hi"],
  ]);
});

test("extractAddress reads the last <…>, past a quoted display name containing one", () => {
  expect(extractAddress('"Ada <3 Blog" <noreply@blog.example>')).toBe("noreply@blog.example");
});
