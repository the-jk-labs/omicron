// SPDX-License-Identifier: AGPL-3.0-or-later

// Opaque, single-use tokens for out-of-band auth flows (password reset, email
// verification). The raw token is emailed to the user; only its SHA-256 hash is
// persisted, so a database read can never be replayed into a valid link.

/** A high-entropy, URL-safe token to embed in an emailed link. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest of a token — the form stored in the database. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
