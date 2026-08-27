// SPDX-License-Identifier: AGPL-3.0-or-later

// Pure helpers for reasoning about upload URLs. The SQL reference scan in
// db/repositories/uploads.ts mirrors the filename grammar here — keep the two
// in sync, or the GC will disagree with the app about what is a reference.

// The filename grammar every stored upload follows: `<uuid>.<raster ext>`.
// The serving route (`/api/uploads/:file`) accepts the same set, as does the
// media service's persisted naming.
const FILENAME = "[a-zA-Z0-9-]+\\.(?:png|jpe?g|webp|gif)";

/**
 * The upload filename a root-relative URL points at, or null when `url` is not
 * one. Absolute http(s) URLs are someone else's host, `/api/uploads/og/…` is a
 * derived share image (not the stored file), and anything else is not an
 * upload — all must return null so the GC never treats them as references.
 */
export function uploadFilenameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = new RegExp(`^/api/uploads/(${FILENAME})$`).exec(url.trim());
  return match?.[1] ?? null;
}

/** Every upload filename appearing anywhere in `text`, deduplicated. */
export function uploadFilenamesInText(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...new Set([...text.matchAll(new RegExp(`/api/uploads/(${FILENAME})`, "g"))].map((m) => m[1]))];
}
