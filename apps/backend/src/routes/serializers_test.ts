// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { publicUser } from "@/routes/serializers.ts";
import type { User } from "@/db/schema.ts";

// The serializers decide what leaves the server. These tests pin the parts that
// are privacy decisions rather than plumbing.

const user = {
  id: "u1",
  username: "ada",
  email: "private@example.com",
  passwordHash: "x",
  displayName: "Ada",
  bio: "Mathematician",
  publicEmail: "hi@example.com",
  customSection: "# Secret plans",
  customSectionHtml: "<h1>Secret plans</h1>",
  avatarUrl: null,
  isAdmin: false,
  isPrivate: true,
  emailVerifiedAt: null,
  suspendedAt: null,
  actorKeyPair: null,
  createdAt: new Date(),
} as User;

Deno.test("publicUser: never leaks credentials or the login email", () => {
  const out = publicUser(user) as Record<string, unknown>;
  assertEquals("passwordHash" in out, false);
  assertEquals("email" in out, false);
  assertEquals("actorKeyPair" in out, false);
});

Deno.test("publicUser: withholds the custom section on a locked profile", () => {
  const out = publicUser(user, [], [], { locked: true });
  assertEquals(out.customSection, "");
  assertEquals(out.customSectionHtml, "");
  // The header still renders, so a stranger can decide whether to follow.
  assertEquals(out.bio, "Mathematician");
  assertEquals(out.displayName, "Ada");
});

Deno.test("publicUser: serves the custom section when not locked", () => {
  const out = publicUser(user);
  assertEquals(out.customSection, "# Secret plans");
  assertEquals(out.customSectionHtml, "<h1>Secret plans</h1>");
});
