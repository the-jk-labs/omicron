// SPDX-License-Identifier: AGPL-3.0-or-later
// Client-side tag normalization, mirroring the backend (apps/backend/src/lib/
// tags.ts). Used by the tag input so chips display the same slug the server
// stores. The server re-normalizes on save — this is purely for UX.

export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_PER_POST = 5;
export const MAX_PROFILE_TAGS = 10;

export function normalizeTag(raw: string): string {
  return (
    raw
      .normalize("NFKC")
      .toLowerCase()
      .replace(/^#+/, "")
      // `c++` → `cpp`, `c#` → `csharp`; see the backend copy for why.
      .replace(/(?<=[\p{L}\p{M}\p{N}_])\++/gu, (run) => "p".repeat(run.length))
      .replace(/(?<=[\p{L}\p{M}\p{N}_])#/gu, "sharp")
      .replace(/[^\p{L}\p{M}\p{N}_]+/gu, "")
      .slice(0, MAX_TAG_LENGTH)
  );
}
