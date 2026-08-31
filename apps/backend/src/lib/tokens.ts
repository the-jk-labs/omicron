// SPDX-License-Identifier: AGPL-3.0-or-later

/** SHA-256 hex digest of a string — a stable, non-reversible lookup key. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
