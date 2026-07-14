// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { isRemoteHandle } from "@/lib/handles.ts";

// removeFollower (and other relation actions) route by this predicate: a local
// username hits the local edge, a remote `user@host` handle federates a Reject.
// If it misclassified, a removal would silently target the wrong path — so pin
// both sides.

Deno.test("isRemoteHandle: local usernames are not remote", () => {
  for (const local of ["alice", "bob_123", "a_b_c", "user30chars_0000000000000000"]) {
    assertEquals(isRemoteHandle(local), false, `${local} should be local`);
  }
});

Deno.test("isRemoteHandle: user@host handles are remote", () => {
  for (const remote of ["alice@fosstodon.org", "bob@mastodon.social", "x@a.b.example.com"]) {
    assertEquals(isRemoteHandle(remote), true, `${remote} should be remote`);
  }
});

Deno.test("isRemoteHandle: a leading-@ handle is still remote", () => {
  assertEquals(isRemoteHandle("@alice@fosstodon.org"), true);
});
