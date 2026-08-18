// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertStringIncludes, assertThrows } from "@std/assert";
import { buildMessage, extractAddress } from "@/lib/mime.ts";

// Header injection: a CR/LF in an address or subject must be refused, never
// serialized into a header line. This is the defense-in-depth backing the
// address validation in services/auth.ts.
Deno.test("buildMessage rejects a newline in the recipient", () => {
  assertThrows(
    () =>
      buildMessage({
        from: "Omicron <no-reply@example.com>",
        to: "victim@example.com\r\nBcc: attacker@evil.example",
        subject: "Hello",
        text: "body",
      }),
    Error,
    "control character",
  );
});

Deno.test("buildMessage rejects a newline in the sender", () => {
  assertThrows(
    () =>
      buildMessage({
        from: "no-reply@example.com\nInjected: yes",
        to: "user@example.com",
        subject: "Hello",
        text: "body",
      }),
    Error,
    "control character",
  );
});

Deno.test("buildMessage rejects a newline in the subject", () => {
  assertThrows(
    () =>
      buildMessage({
        from: "no-reply@example.com",
        to: "user@example.com",
        subject: "Hello\r\nX-Injected: 1",
        text: "body",
      }),
    Error,
    "control character",
  );
});

Deno.test("buildMessage accepts a well-formed message", () => {
  const { headers, fromAddress } = buildMessage({
    from: "Omicron <no-reply@example.com>",
    to: "user@example.com",
    subject: "Reset your password",
    text: "body",
  });
  const rendered = headers.map(([n, v]) => `${n}: ${v}`).join("\n");
  assertStringIncludes(rendered, "To: user@example.com");
  assertStringIncludes(rendered, "Subject: Reset your password");
  // The body carries a newline (base64 line wrapping) but that is not a header,
  // so it is unaffected by the header guard.
  if (fromAddress !== "no-reply@example.com") throw new Error("bad from address");
});

Deno.test("extractAddress pulls the bare address from a display-name form", () => {
  if (extractAddress("Omicron <no-reply@example.com>") !== "no-reply@example.com") {
    throw new Error("extractAddress failed");
  }
});
