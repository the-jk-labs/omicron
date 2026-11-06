// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { androidOrigins } from "@/lib/androidApp.ts";

test("names a key by its digest in unpadded base64url", () => {
  // 0xFB 0xFF… encodes to `-` and `_`, which plain base64 would write as `+` and `/`.
  const fingerprint = ["FB", "FF", ...Array.from({ length: 30 }, () => "00")].join(":");
  expect(androidOrigins([fingerprint])).toEqual(["android:apk-key-hash:-_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"]);
});

test("matches the digest of the certificate the fingerprint describes", () => {
  const digest = createHash("sha256").update("certificate").digest();
  const fingerprint = digest.toString("hex").toUpperCase().match(/../g)?.join(":") ?? "";
  expect(androidOrigins([fingerprint])).toEqual([`android:apk-key-hash:${digest.toString("base64url")}`]);
});

test("gives one origin per key, and none without keys", () => {
  const key = (byte: string) => Array.from({ length: 32 }, () => byte).join(":");
  expect(androidOrigins([key("AA"), key("BB")])).toHaveLength(2);
  expect(androidOrigins([])).toEqual([]);
});
