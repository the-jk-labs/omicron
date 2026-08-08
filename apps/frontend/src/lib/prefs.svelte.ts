// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";
import { LANGUAGES } from "$lib/languages";

// Client-side reading preferences, persisted in localStorage. These are personal
// view settings (not account data), so they live in the browser, not the server.
export type FeedTab = "for-you" | "local" | "global";

// How the feed language filter treats the chosen `feedLangs`: "show" keeps only
// those languages, "hide" removes them. Posts with no declared language are
// always kept in both modes (see the backend `languageFilter`).
export type FeedLangMode = "show" | "hide";

const FEED_KEY = "default-feed";
const LANG_MODE_KEY = "feed-lang-mode";
const LANGS_KEY = "feed-langs";
const COMPOSE_LANG_KEY = "compose-lang";

function initialFeed(): FeedTab | null {
  if (!browser) return null;
  const v = localStorage.getItem(FEED_KEY);
  return v === "for-you" || v === "local" || v === "global" ? v : null;
}

function initialLangMode(): FeedLangMode {
  if (!browser) return "hide";
  const v = localStorage.getItem(LANG_MODE_KEY);
  return v === "show" ? "show" : "hide";
}

function initialLangs(): string[] {
  if (!browser) return [];
  const raw = localStorage.getItem(LANGS_KEY);
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
  const saved = localStorage.getItem(COMPOSE_LANG_KEY);
  if (saved) return saved;
  // `navigator.language` is a full locale ("az-AZ", "pt-BR"); posts are tagged
  // with the primary subtag alone, which is what the backend stores and
  // federates.
  const nav = navigator.language?.split("-")[0]?.toLowerCase();
  return nav && LANGUAGES.some((l) => l.code === nav) ? nav : null;
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
    if (browser) localStorage.setItem(FEED_KEY, tab);
  }

  setFeedLangMode(mode: FeedLangMode) {
    this.feedLangMode = mode;
    if (browser) localStorage.setItem(LANG_MODE_KEY, mode);
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
    if (browser) localStorage.setItem(LANGS_KEY, JSON.stringify(this.feedLangs));
  }

  /** Language to preselect in the composer; null when nothing is known. */
  composeLang = $state<string | null>(initialComposeLang());

  /** Remember the language an author actually published in. */
  setComposeLang(code: string | null) {
    this.composeLang = code;
    if (!browser) return;
    if (code) localStorage.setItem(COMPOSE_LANG_KEY, code);
    else localStorage.removeItem(COMPOSE_LANG_KEY);
  }

  /** The active filter as API query params, or null when the filter is off. */
  feedLangQuery(): { langMode: FeedLangMode; langs: string } | null {
    if (this.feedLangs.length === 0) return null;
    return { langMode: this.feedLangMode, langs: this.feedLangs.join(",") };
  }
}

export const reading = new ReadingPrefs();
