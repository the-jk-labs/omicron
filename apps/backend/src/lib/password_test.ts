// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password.ts";

// Auth's core invariant: passwords are stored only as salted bcrypt hashes, and
// verification accepts the right password and rejects the wrong one.

test("hashPassword: never returns the plaintext, uses bcrypt", async () => {
  const hash = await hashPassword("correct horse battery staple");
  expect(hash).not.toBe("correct horse battery staple");
  expect(hash.startsWith("$2")).toBe(true);
});

test("hashPassword: salts (same input -> different hashes)", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  expect(a).not.toBe(b);
});

test("verifyPassword: accepts the right password, rejects the wrong one", async () => {
  const hash = await hashPassword("s3cret-pass");
  expect(await verifyPassword("s3cret-pass", hash)).toBe(true);
  expect(await verifyPassword("wrong-pass", hash)).toBe(false);
});
