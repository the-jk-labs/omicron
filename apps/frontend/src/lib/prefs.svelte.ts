// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/env";
import { LANGUAGES } from "#lib/languages.js";
import { localeFromAcceptLanguage } from "#lib/locale.svelte.js";
import { readStorage, writeStorage } from "#lib/storage.js";

// Client-side reading preferences. These are personal view settings (not account
// data), so they live in the browser, not the server.
export type FeedTab = "for-you" | "local" | "global";

// How the feed language filter treats the chosen `feedLangs`: "show" keeps only
// those languages, "hide" removes them. Posts with no declared language are
// always kept in both modes (see the backend `languageFilter`).
export type FeedLangMode = "show" | "hide";

// Cookies, not localStorage: the server renders the home feed, the language card
// and the settings switches from them, so nothing flips after hydration.
export const FEED_COOKIE = "default-feed";
export const LANG_MODE_COOKIE = "feed-lang-mode";
export const LANGS_COOKIE = "feed-langs";
export const LANG_CARD_COOKIE = "feed-lang-card-dismissed";
const COMPOSE_LANG_KEY = "compose-lang";
// The composer is server-rendered, so its default language also lives in a
// cookie the server can read; otherwise the picker would flip after hydration.
export const COMPOSE_LANG_COOKIE = "compose-lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** A saved feed tab, or null for anything else. */
export function feedTab(v: string | null | undefined): FeedTab | null {
  return v === "for-you" || v === "local" || v === "global" ? v : null;
}

export type FeedFilter = { mode: FeedLangMode; langs: string[]; cardDismissed: boolean };

/** The feed language filter as saved in cookies; `get` reads one by name. */
export function feedFilterFrom(get: (name: string) => string | null | undefined): FeedFilter {
  const langs = (get(LANGS_COOKIE) ?? "").split(",").filter((c) => LANGUAGES.some((l) => l.code === c));
  return {
    mode: get(LANG_MODE_COOKIE) === "hide" ? "hide" : "show",
    langs: [...new Set(langs)],
    cardDismissed: get(LANG_CARD_COOKIE) === "1",
  };
}

/** A filter as API query params, or null when it is off. */
export function langQuery(mode: FeedLangMode, langs: string[]): { langMode: FeedLangMode; langs: string } | null {
  return langs.length === 0 ? null : { langMode: mode, langs: langs.join(",") };
}

function readCookie(name: string): string | null {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

function writeCookie(name: string, value: string | null) {
  const v = value ? encodeURIComponent(value) : "";
  document.cookie = `${name}=${v}; path=/; max-age=${value ? COOKIE_MAX_AGE : 0}; SameSite=Lax`;
}

function initialFeed(): FeedTab | null {
  return browser ? feedTab(readCookie(FEED_COOKIE)) : null;
}

const initialFilter = (): FeedFilter =>
  browser ? feedFilterFrom(readCookie) : { mode: "show", langs: [], cardDismissed: false };

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

/** The composer's default as the server sees it: the remembered choice, else the browser's language. */
export function composeLangFor(cookie: string | undefined, acceptLanguage: string | null): string | null {
  return knownLanguage(cookie) ?? knownLanguage(localeFromAcceptLanguage(acceptLanguage));
}

class ReadingPrefs {
  /** Preferred default feed tab on Home; null means "use the app default". */
  defaultFeed = $state<FeedTab | null>(initialFeed());

  /** Feed language filter mode — whether `feedLangs` is a show- or hide-list. */
  feedLangMode = $state<FeedLangMode>(initialFilter().mode);
  /** Language codes the filter applies to. Empty = filter off (see all). */
  feedLangs = $state<string[]>(initialFilter().langs);
  /** Whether the reader closed the language card on the home page. */
  feedLangCardDismissed = $state(initialFilter().cardDismissed);

  setDefaultFeed(tab: FeedTab) {
    this.defaultFeed = tab;
    if (browser) writeCookie(FEED_COOKIE, tab);
  }

  setFeedLangMode(mode: FeedLangMode) {
    this.feedLangMode = mode;
    if (browser) writeCookie(LANG_MODE_COOKIE, mode);
  }

  dismissFeedLangCard() {
    this.feedLangCardDismissed = true;
    if (browser) writeCookie(LANG_CARD_COOKIE, "1");
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
    if (browser) writeCookie(LANGS_COOKIE, this.feedLangs.join(",") || null);
  }

  /** Language to preselect in the composer; null when nothing is known. */
  composeLang = $state<string | null>(initialComposeLang());

  /** Remember the language an author actually published in. */
  setComposeLang(code: string | null) {
    this.composeLang = code;
    if (!browser) return;
    writeStorage(COMPOSE_LANG_KEY, code || null);
    writeCookie(COMPOSE_LANG_COOKIE, code);
  }

  /** The active filter as API query params, or null when the filter is off. */
  feedLangQuery() {
    return langQuery(this.feedLangMode, this.feedLangs);
  }
}

export const reading = new ReadingPrefs();
