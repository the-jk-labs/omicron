// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { isRemoteHandle } from "@/lib/handles.ts";

// removeFollower (and other relation actions) route by this predicate: a local
// username hits the local edge, a remote `user@host` handle federates a Reject.
// If it misclassified, a removal would silently target the wrong path — so pin
// both sides.

test("isRemoteHandle: local usernames are not remote", () => {
  for (const local of ["alice", "bob_123", "a_b_c", "user30chars_0000000000000000"]) {
    expect(isRemoteHandle(local), `${local} should be local`).toBe(false);
  }
});

test("isRemoteHandle: user@host handles are remote", () => {
  for (const remote of ["alice@fosstodon.org", "bob@mastodon.social", "x@a.b.example.com"]) {
    expect(isRemoteHandle(remote), `${remote} should be remote`).toBe(true);
  }
});

test("isRemoteHandle: a leading-@ handle is still remote", () => {
  expect(isRemoteHandle("@alice@fosstodon.org")).toBe(true);
});
