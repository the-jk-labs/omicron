// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/env";
import { LANGUAGES } from "#lib/languages.js";
import { localeFromAcceptLanguage } from "#lib/locale.svelte.js";
import { readStorage, writeStorage } from "#lib/storage.js";

// Client-side reading preferences, persisted in localStorage. These are personal
// view settings (not account data), so they live in the browser, not the server.
export type FeedTab = "for-you" | "local" | "global";

// How the feed language filter treats the chosen `feedLangs`: "show" keeps only
// those languages, "hide" removes them. Posts with no declared language are
// always kept in both modes (see the backend `languageFilter`).
export type FeedLangMode = "show" | "hide";

// A cookie, not localStorage: the server renders the home tab and the settings
// switch from it, so neither flips after hydration.
export const FEED_COOKIE = "default-feed";
const LANG_MODE_KEY = "feed-lang-mode";
const LANGS_KEY = "feed-langs";
const COMPOSE_LANG_KEY = "compose-lang";
// The composer is server-rendered, so its default language also lives in a
// cookie the server can read; otherwise the picker would flip after hydration.
export const COMPOSE_LANG_COOKIE = "compose-lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A saved feed tab, or null for anything else. */
export function feedTab(v: string | null | undefined): FeedTab | null {
  return v === "for-you" || v === "local" || v === "global" ? v : null;
}

function readCookie(name: string): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function initialFeed(): FeedTab | null {
  return browser ? feedTab(readCookie(FEED_COOKIE)) : null;
}

function initialLangMode(): FeedLangMode {
  if (!browser) return "show";
  const v = readStorage(LANG_MODE_KEY);
  return v === "hide" ? "hide" : "show";
}

function initialLangs(): string[] {
  if (!browser) return [];
  const raw = readStorage(LANGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

// The language to preselect when composing: whatever the author chose last,
// falling back to the language their browser is set to.
//
// The field is optional, and left to itself it stays empty — which is how most
// posts ended up declaring nothing, so the page served them as English whatever
// they were actually written in and search engines offered them to the wrong
// readers. An author writing in Azerbaijani is overwhelmingly likely to do so
// again, and their browser already says as much on the very first post, so
// neither guess needs them to think about it.
//
// Only ever a default. It preselects the control; the author can change or
// clear it, and doing so is what teaches the next one.
function initialComposeLang(): string | null {
  if (!browser) return null;
  return readStorage(COMPOSE_LANG_KEY) || knownLanguage(navigator.language);
}

// A locale ("az-AZ", "pt-BR") as the primary subtag posts are tagged with, which
// is what the backend stores and federates; null for a language we don't list.
function knownLanguage(tag: string | null | undefined): string | null {
  const code = tag?.split("-")[0]?.toLowerCase();
  return code && LANGUAGES.some((l) => l.code === code) ? code : null;
}

function writeComposeLangCookie(code: string | null) {
  const value = code ? encodeURIComponent(code) : "";
  document.cookie = `${COMPOSE_LANG_COOKIE}=${value}; path=/; max-age=${code ? COOKIE_MAX_AGE : 0}; SameSite=Lax`;
}

/** The composer's default as the server sees it: the remembered choice, else the browser's language. */
export function composeLangFor(cookie: string | undefined, acceptLanguage: string | null): string | null {
  return knownLanguage(cookie) ?? knownLanguage(localeFromAcceptLanguage(acceptLanguage));
}

class ReadingPrefs {
  /** Preferred default feed tab on Home; null means "use the app default". */
  defaultFeed = $state<FeedTab | null>(initialFeed());

  /** Feed language filter mode — whether `feedLangs` is a show- or hide-list. */
  feedLangMode = $state<FeedLangMode>(initialLangMode());
  /** Language codes the filter applies to. Empty = filter off (see all). */
  feedLangs = $state<string[]>(initialLangs());

  setDefaultFeed(tab: FeedTab) {
    this.defaultFeed = tab;
    if (browser) document.cookie = `${FEED_COOKIE}=${tab}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  setFeedLangMode(mode: FeedLangMode) {
    this.feedLangMode = mode;
    if (browser) writeStorage(LANG_MODE_KEY, mode);
  }

  addFeedLang(code: string) {
    if (this.feedLangs.includes(code)) return;
    this.feedLangs = [...this.feedLangs, code];
    this.persistLangs();
  }

  removeFeedLang(code: string) {
    this.feedLangs = this.feedLangs.filter((c) => c !== code);
    this.persistLangs();
  }

  private persistLangs() {
    if (browser) writeStorage(LANGS_KEY, JSON.stringify(this.feedLangs));
  }

  /** Language to preselect in the composer; null when nothing is known. */
  composeLang = $state<string | null>(initialComposeLang());

  /** Remember the language an author actually published in. */
  setComposeLang(code: string | null) {
    this.composeLang = code;
    if (!browser) return;
    writeStorage(COMPOSE_LANG_KEY, code || null);
    writeComposeLangCookie(code);
  }

  /** The active filter as API query params, or null when the filter is off. */
  feedLangQuery(): { langMode: FeedLangMode; langs: string } | null {
    if (this.feedLangs.length === 0) return null;
    return { langMode: this.feedLangMode, langs: this.feedLangs.join(",") };
  }
}

export const reading = new ReadingPrefs();
