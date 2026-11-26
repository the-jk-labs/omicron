// SPDX-License-Identifier: AGPL-3.0-or-later
import type { authClient } from "#lib/auth-client.js";

// The Better Auth client (~16 KB gzip) on first use, for code on every page that
// only needs it after a click (sign out) or a delay (the passkey offer), so it
// isn't in the bundle every reader downloads. Pages that sign in use it directly.
export function loadAuthClient(): Promise<typeof authClient> {
  return import("#lib/auth-client.js").then((m) => m.authClient);
}
