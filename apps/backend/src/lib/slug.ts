// SPDX-License-Identifier: AGPL-3.0-or-later

// Kebab-case slugs. Kept byte-for-byte in step with the frontend's `slugify`
// (apps/frontend/src/lib/links.ts), which builds the canonical `/@user/some-title`
// post URLs — an ingesting CMS that derives its key from a title must land on
// the same string the reader sees in the address bar.

/**
 * Letters that carry no ASCII decomposition, so NFKD leaves them intact and the
 * `[^a-z0-9]` sweep below would otherwise turn each one into a dash — a title
 * written in Azerbaijani came out as `s-rz-nisl-r` instead of `sozunuslar`.
 *
 * Only letters NFKD cannot handle belong here. `ö`, `ü`, `ş`, `ç`, `ğ` and the
 * rest of the accented Latin range decompose to a base letter plus a combining
 * mark and are handled by stripping the mark; `ə` and `ı` are letters in their
 * own right and have no decomposition at all.
 *
 * Non-Latin scripts (Cyrillic, Greek, Arabic, CJK…) are deliberately absent:
 * transliterating them is a per-language decision with no single right answer,
 * and a title in one of them slugifies to empty and falls back to the post's
 * short id, which is a working URL rather than a wrong one.
 */
const TRANSLITERATIONS: Record<string, string> = {
  "ə": "e",
  "ı": "i",
  "ø": "o",
  "đ": "d",
  "ð": "d",
  "ħ": "h",
  "ŋ": "n",
  "ł": "l",
  "ß": "ss",
  "æ": "ae",
  "œ": "oe",
  "þ": "th",
};

const TRANSLITERATE_RE = new RegExp(`[${Object.keys(TRANSLITERATIONS).join("")}]`, "g");

/** Kebab-case an arbitrary title; ASCII-only, matching Medium-style slugs. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(TRANSLITERATE_RE, (ch) => TRANSLITERATIONS[ch])
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/['\u2019`]/g, "") // drop apostrophes so "it's" -> "its"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
