// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";

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

  /** The active filter as API query params, or null when the filter is off. */
  feedLangQuery(): { langMode: FeedLangMode; langs: string } | null {
    if (this.feedLangs.length === 0) return null;
    return { langMode: this.feedLangMode, langs: this.feedLangs.join(",") };
  }
}

export const reading = new ReadingPrefs();
