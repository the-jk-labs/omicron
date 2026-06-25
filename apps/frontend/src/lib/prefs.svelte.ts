// SPDX-License-Identifier: AGPL-3.0-or-later
import { browser } from "$app/environment";

// Client-side reading preferences, persisted in localStorage. These are personal
// view settings (not account data), so they live in the browser, not the server.
export type FeedTab = "for-you" | "local" | "global";

const FEED_KEY = "default-feed";

function initialFeed(): FeedTab | null {
  if (!browser) return null;
  const v = localStorage.getItem(FEED_KEY);
  return v === "for-you" || v === "local" || v === "global" ? v : null;
}

class ReadingPrefs {
  /** Preferred default feed tab on Home; null means "use the app default". */
  defaultFeed = $state<FeedTab | null>(initialFeed());

  setDefaultFeed(tab: FeedTab) {
    this.defaultFeed = tab;
    if (browser) localStorage.setItem(FEED_KEY, tab);
  }
}

export const reading = new ReadingPrefs();
