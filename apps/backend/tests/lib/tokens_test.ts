// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { hashToken } from "@/lib/tokens.ts";

test("hashToken: matches the SHA-256 test vector", async () => {
  expect(await hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("hashToken: hashes the empty string", async () => {
  expect(await hashToken("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("hashToken: is deterministic and case-sensitive", async () => {
  expect(await hashToken("Token")).toBe(await hashToken("Token"));
  expect(await hashToken("Token")).not.toBe(await hashToken("token"));
});

test("hashToken: hashes non-ASCII input as UTF-8", async () => {
  const expected = await crypto.subtle.digest("SHA-256", new Uint8Array([0xc3, 0xa9]));
  const hex = [...new Uint8Array(expected)].map((b) => b.toString(16).padStart(2, "0")).join("");
  expect(await hashToken("é")).toBe(hex);
});
