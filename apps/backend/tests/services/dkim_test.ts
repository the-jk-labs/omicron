// SPDX-License-Identifier: AGPL-3.0-or-later
// Real Web Crypto throughout: the point is that what we sign verifies, and that
// any change a mail relay is not allowed to make breaks the signature.
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildMessage } from "@/lib/mime.ts";
import { type DkimKeyPair, dnsRecords, generateKeyPair, signMessage, verifyOwn } from "@/services/dkim.ts";

let keys: DkimKeyPair;
let otherKeys: DkimKeyPair;

beforeAll(async () => {
  [keys, otherKeys] = await Promise.all([generateKeyPair(), generateKeyPair()]);
});

function message() {
  return buildMessage({
    from: "Omicron <no-reply@mail.example>",
    to: "ada@example.test",
    subject: "Reset your password",
    text: "Click the link.",
    html: "<p>Click the link.</p>",
  });
}

const opts = () => ({ domain: "mail.example", selector: "omicron", privateKey: keys.privateKey });

describe("generateKeyPair", () => {
  test("produces distinct base64 PKCS#8 / SPKI keys", () => {
    expect(keys.privateKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(keys.privateKey).not.toBe(otherKeys.privateKey);
    // RSA-2048 SPKI is 294 bytes -> 392 base64 characters.
    expect(keys.publicKey).toHaveLength(392);
  });
});

describe("signMessage", () => {
  test("emits a well-formed DKIM-Signature header", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { headers, body } = message();
    const sig = await signMessage(headers, body, opts());
    vi.useRealTimers();
    expect(sig).toMatch(/^DKIM-Signature: v=1; a=rsa-sha256; c=relaxed\/relaxed; d=mail\.example; s=omicron; /);
    expect(sig).toContain(`t=${Date.UTC(2026, 0, 1) / 1000};`);
    expect(sig).toContain("h=from:to:subject:date:message-id:mime-version:content-type;");
    expect(sig).toMatch(/bh=[A-Za-z0-9+/]+=*; /);
    expect(sig).toMatch(/b=[A-Za-z0-9+/]+=*$/);
  });

  test("signs only the headers present, in canonical order", async () => {
    const sig = await signMessage(
      [
        ["Subject", "s"],
        ["From", "a@mail.example"],
        ["X-Custom", "ignored"],
      ],
      "body",
      opts(),
    );
    expect(sig).toContain("h=from:subject;");
  });

  test("round-trips through verifyOwn", async () => {
    const { headers, body } = message();
    const sig = await signMessage(headers, body, opts());
    expect(await verifyOwn(headers, body, sig, keys.publicKey)).toBe(true);
  });

  test("rejects a different key", async () => {
    const { headers, body } = message();
    const sig = await signMessage(headers, body, opts());
    expect(await verifyOwn(headers, body, sig, otherKeys.publicKey)).toBe(false);
  });

  test("detects a changed body", async () => {
    const { headers, body } = message();
    const sig = await signMessage(headers, body, opts());
    expect(await verifyOwn(headers, body.replace(/[A-Za-z]/, "Z"), sig, keys.publicKey)).toBe(false);
  });

  test("detects a changed signed header", async () => {
    const { headers, body } = message();
    const sig = await signMessage(headers, body, opts());
    const tampered = headers.map(([n, v]): [string, string] => (n === "Subject" ? [n, "Pay me"] : [n, v]));
    expect(await verifyOwn(tampered, body, sig, keys.publicKey)).toBe(false);
  });

  test("relaxed canonicalization survives header case, whitespace and folding", async () => {
    const { headers, body } = message();
    const sig = await signMessage(headers, body, opts());
    const relayed = headers.map(([n, v]): [string, string] => [n.toUpperCase(), ` ${v.replace(/ /g, "  \t")}\r\n `]);
    expect(await verifyOwn(relayed, body, sig, keys.publicKey)).toBe(true);
  });

  test("relaxed body canonicalization ignores trailing whitespace and blank lines", async () => {
    const headers: [string, string][] = [["From", "a@mail.example"]];
    const sig = await signMessage(headers, "line one\r\nline  two\r\n", opts());
    expect(await verifyOwn(headers, "line one   \r\nline two\r\n\r\n\r\n", sig, keys.publicKey)).toBe(true);
    expect(await verifyOwn(headers, "line one\nline two\n", sig, keys.publicKey)).toBe(true);
    expect(await verifyOwn(headers, "line one\r\nline two extra\r\n", sig, keys.publicKey)).toBe(false);
  });

  test("an empty body signs and verifies", async () => {
    const headers: [string, string][] = [["From", "a@mail.example"]];
    const sig = await signMessage(headers, "", opts());
    expect(await verifyOwn(headers, "\r\n\r\n", sig, keys.publicKey)).toBe(true);
  });

  test("a private key that is not PKCS#8 is refused", async () => {
    await expect(signMessage([["From", "a@x"]], "b", { ...opts(), privateKey: "bm90IGEga2V5" })).rejects.toBeInstanceOf(
      Error,
    );
  });
});

describe("dnsRecords", () => {
  test("describes the three records to publish", () => {
    expect(dnsRecords("mail.example", "omicron", "PUBKEY")).toEqual({
      spf: { host: "mail.example", type: "TXT", value: "v=spf1 a mx ~all" },
      dkim: { host: "omicron._domainkey.mail.example", type: "TXT", value: "v=DKIM1; k=rsa; p=PUBKEY" },
      dmarc: {
        host: "_dmarc.mail.example",
        type: "TXT",
        value: "v=DMARC1; p=none; rua=mailto:postmaster@mail.example",
      },
    });
  });
});
