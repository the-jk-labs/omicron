// SPDX-License-Identifier: AGPL-3.0-or-later
// Client-side tag normalization, mirroring the backend (apps/backend/src/lib/
// tags.ts). Used by the tag input so chips display the same slug the server
// stores. The server re-normalizes on save — this is purely for UX.

export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_PER_POST = 5;

export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{M}\p{N}_]+/gu, "")
    .slice(0, MAX_TAG_LENGTH);
}
