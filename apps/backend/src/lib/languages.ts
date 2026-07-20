// SPDX-License-Identifier: AGPL-3.0-or-later

// Per-post language helpers. Omicron stores a single BCP-47 *primary* language
// subtag per post (e.g. "en", "pt") — the granularity the reader's feed filter
// works at — rather than a full tag with region/script, so "pt-BR" and "pt-PT"
// both match a reader filtering for "pt".

// Normalizes an author-supplied language tag to a bare lowercase primary subtag,
// or null ("unspecified") when it's missing or malformed. Accepts full BCP-47
// tags ("en-US") and takes only the primary subtag.
export function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const primary = raw.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}

// The reader's feed language filter, decoded from the timeline query params.
// `mode` is "show" (only these languages) or "hide" (everything except these);
// `langs` is the chosen set of primary subtags. Never empty (see parse below).
export type LanguageFilter = { mode: "show" | "hide"; langs: string[] };

// Builds a LanguageFilter from raw query values, or null when the filter is
// off (no valid mode, or no valid languages). `langsCsv` is a comma-separated
// list of language codes.
export function parseLanguageFilter(
  mode: string | undefined,
  langsCsv: string | undefined,
): LanguageFilter | null {
  if (mode !== "show" && mode !== "hide") return null;
  const langs = [
    ...new Set(
      (langsCsv ?? "")
        .split(",")
        .map((l) => normalizeLanguage(l))
        .filter((l): l is string => l !== null),
    ),
  ];
  return langs.length > 0 ? { mode, langs } : null;
}
