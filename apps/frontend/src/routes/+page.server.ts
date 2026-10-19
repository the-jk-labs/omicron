// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "#lib/api/index.js";
import { FEED_COOKIE, type FeedTab, feedFilterFrom, feedTab, langQuery } from "#lib/prefs.svelte.js";
import type { PageServerLoad } from "./$types";

// Home: preload the URL's tab, falling back to the saved default, then "For you"
// when signed in or "Global" for guests. Other tabs load lazily on first open.
export const load: PageServerLoad = async ({ fetch, parent, cookies, url }) => {
  const { user } = await parent();
  const api = endpoints(fetch);
  const offered: FeedTab[] = user ? ["for-you", "local", "global"] : ["global", "local"];
  const saved = feedTab(cookies.get(FEED_COOKIE));
  const requested = feedTab(url.searchParams.get("tab"));
  const tab = [requested, saved].find((value) => value && offered.includes(value)) ?? offered[0];
  const { mode, langs } = feedFilterFrom((name) => cookies.get(name));
  const filter = user ? langQuery(mode, langs) : null;
  const page =
    tab === "for-you"
      ? await api.feed()
      : tab === "local"
        ? await api.localTimeline(null, filter)
        : await api.globalTimeline(null, filter);
  return { page, personalized: !!user, tab };
};
