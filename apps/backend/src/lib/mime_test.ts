// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { buildMessage, extractAddress } from "@/lib/mime.ts";

// Header injection: a CR/LF in an address or subject must be refused, never
// serialized into a header line. This is the defense-in-depth backing the
// address validation in services/auth.ts.
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
