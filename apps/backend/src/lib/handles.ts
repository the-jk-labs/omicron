// SPDX-License-Identifier: AGPL-3.0-or-later

// Local usernames are `^[a-z0-9_]{3,30}$` (see auth) and never contain `@`, so a
// bare `@` cleanly distinguishes a remote `user@host` fediverse handle from a
// local username. Used to route relation actions (e.g. removing a follower) to
// the local or remote code path.
export function isRemoteHandle(identifier: string): boolean {
  return identifier.includes("@");
}
