// SPDX-License-Identifier: AGPL-3.0-or-later

// Builds a raw RFC 5322 message. Parts are base64-encoded so the body is pure
// ASCII with bounded line length — no 8BITMIME dependency, no dot-stuffing
// surprises, and a stable byte sequence for DKIM to hash.

export interface MessageInput {
  /** Full From header, may include a display name (e.g. `Omicron <no-reply@x>`). */
  from: string;
  /** Bare recipient address. */
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface BuiltMessage {
  /** Ordered header list (name, value) — the input to DKIM header signing. */
  headers: [string, string][];
  /** The message body (everything after the header/body separator). */
  body: string;
  /** Bare address extracted from `from`, for the SMTP envelope + DKIM domain. */
  fromAddress: string;
}

const CRLF = "\r\n";

/** Extract the bare address from a `Name <addr>` or `addr` header value. */
export function extractAddress(value: string): string {
  const angle = value.match(/<([^>]+)>/);
  return (angle ? angle[1] : value).trim();
}

export function domainOf(address: string): string {
  return address.split("@")[1]?.toLowerCase() ?? "";
}

// RFC 5322 date: `Wed, 21 Oct 2015 07:28:00 +0000`. Date.toUTCString ends with
// "GMT"; DKIM/mail want a numeric zone.
function rfc5322Date(d = new Date()): string {
  return d.toUTCString().replace("GMT", "+0000");
}

function base64Wrapped(input: string): string {
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(input)));
  return (b64.match(/.{1,76}/g) ?? [b64]).join(CRLF);
}

function randomBoundary(): string {
  return "omi_" + crypto.randomUUID().replace(/-/g, "");
}

/** Assemble headers + body for a text (and optional HTML) message. */
export function buildMessage(input: MessageInput): BuiltMessage {
  const fromAddress = extractAddress(input.from);
  const domain = domainOf(fromAddress) || "localhost";
  const messageId = `<${crypto.randomUUID()}@${domain}>`;

  const headers: [string, string][] = [
    ["From", input.from],
    ["To", input.to],
    ["Subject", input.subject],
    ["Date", rfc5322Date()],
    ["Message-ID", messageId],
    ["MIME-Version", "1.0"],
  ];

  let body: string;
  if (input.html) {
    const boundary = randomBoundary();
    headers.push(["Content-Type", `multipart/alternative; boundary="${boundary}"`]);
    body = [
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Wrapped(input.text),
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Wrapped(input.html),
      `--${boundary}--`,
      "",
    ].join(CRLF);
  } else {
    headers.push(["Content-Type", "text/plain; charset=utf-8"]);
    headers.push(["Content-Transfer-Encoding", "base64"]);
    body = base64Wrapped(input.text) + CRLF;
  }

  return { headers, body, fromAddress };
}

/** Serialize a header list + body into the final message bytes (CRLF endings). */
export function serializeMessage(headers: [string, string][], body: string): Uint8Array {
  const head = headers.map(([n, v]) => `${n}: ${v}`).join(CRLF);
  return new TextEncoder().encode(head + CRLF + CRLF + body);
}
