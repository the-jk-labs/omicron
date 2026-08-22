// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { derived, writable, type Readable } from "svelte/store";

// User locale — mirrors `timezone.ts` but for `Intl` formatting. The server has
// no navigator, so it reads the locale from a cookie (set by the browser) or
// from the `Accept-Language` header. The browser writes its `navigator.language`
// to the cookie on hydration, so server and client agree and no timestamp
// flickers between `Aug 18` and `18 avq` (see `format.ts`).

export const LOCALE_COOKIE = "locale";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const FALLBACK = "en-US";

const localLocale = writable<string | null>(null);

/** The locale every date on the page is formatted with. Falls back to en-US. */
export const locale: Readable<string> = derived([page, localLocale], ([$page, $local]) => {
  const fromPage = ($page.data as { locale?: string | null }).locale;
  return $local ?? fromPage ?? FALLBACK;
});

/** Publish the browser's locale to the cookie and to `locale`. Call once, on mount. */
export function rememberLocale(): void {
  if (!browser) return;
  const raw = navigator.language;
  const valid = validLocale(raw);
  if (!valid) return;
  localLocale.set(valid);
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(valid)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

/**
 * Validate a locale string via `Intl`. Anything unknown is dropped and the
 * caller falls back to `en-US`.
 */
export function validLocale(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const canonical = Intl.getCanonicalLocales(value)[0];
    // Also ensure DateTimeFormat accepts it (e.g. "en-US" does, "xx" throws).
    new Intl.DateTimeFormat(canonical);
    return canonical;
  } catch {
    return null;
  }
}

/** Parse the first valid locale from an `Accept-Language` header value. */
export function localeFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part
        .trim()
        .split(";")
        .map((p) => p.trim());
      const qMatch = params.map((p) => /^q=([\d.]+)$/i.exec(p)).find((m) => m != null);
      const q = qMatch ? Number(qMatch[1]) : 1;
      return { tag, q, index };
    })
    .filter((e) => e.tag && Number.isFinite(e.q) && e.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of parts) {
    const v = validLocale(tag);
    if (v) return v;
  }
  return null;
}
