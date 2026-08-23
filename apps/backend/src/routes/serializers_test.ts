// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import type { User } from "@/db/schema.ts";
import { publicUser, webhookTokenView } from "@/routes/serializers.ts";

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

test("publicUser: never leaks credentials or the login email", () => {
  const out = publicUser(user) as Record<string, unknown>;
  expect("passwordHash" in out).toBe(false);
  expect("email" in out).toBe(false);
  expect("actorKeyPair" in out).toBe(false);
});

test("publicUser: withholds the custom section on a locked profile", () => {
  const out = publicUser(user, [], [], { locked: true });
  expect(out.customSection).toBe("");
  expect(out.customSectionHtml).toBe("");
  // The header still renders, so a stranger can decide whether to follow.
  expect(out.bio).toBe("Mathematician");
  expect(out.displayName).toBe("Ada");
});

test("publicUser: serves the custom section when not locked", () => {
  const out = publicUser(user);
  expect(out.customSection).toBe("# Secret plans");
  expect(out.customSectionHtml).toBe("<h1>Secret plans</h1>");
});

test("webhookTokenView: never returns the token hash", () => {
  const out = webhookTokenView({
    id: "t1",
    userId: "u1",
    label: "Sanity",
    tokenHash: "b1946ac92492d2347c6235b4d2611184",
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
  }) as Record<string, unknown>;

  // The hash is the credential's only stored form. It is useless to its owner
  // and dangerous everywhere else, so it must not appear on any surface.
  expect("tokenHash" in out).toBe(false);
  // The owning account is implied by the session; echoing it back is noise.
  expect("userId" in out).toBe(false);
  expect(out.label).toBe("Sanity");
});
