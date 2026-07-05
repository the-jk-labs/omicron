// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals, assertNotEquals } from "@std/assert";
import { hashPassword, verifyPassword } from "@/lib/password.ts";

// Auth's core invariant: passwords are stored only as salted bcrypt hashes, and
// verification accepts the right password and rejects the wrong one.

Deno.test("hashPassword: never returns the plaintext, uses bcrypt", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assertNotEquals(hash, "correct horse battery staple");
  assertEquals(hash.startsWith("$2"), true);
});

Deno.test("hashPassword: salts (same input -> different hashes)", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assertNotEquals(a, b);
});

Deno.test("verifyPassword: accepts the right password, rejects the wrong one", async () => {
  const hash = await hashPassword("s3cret-pass");
  assertEquals(await verifyPassword("s3cret-pass", hash), true);
  assertEquals(await verifyPassword("wrong-pass", hash), false);
});
