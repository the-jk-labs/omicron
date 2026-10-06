// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "#lib/api/index.js";
import { FEED_COOKIE, type FeedTab, feedFilterFrom, feedTab, langQuery } from "#lib/prefs.svelte.js";
import type { PageServerLoad } from "./$types";

// Home: preload the reader's saved default tab when it is offered, else "For you"
// when signed in and "Global" for guests, with a signed-in reader's language
// filter applied. The other tabs load lazily on first open.
export const load: PageServerLoad = async ({ fetch, parent, cookies }) => {
  const { user } = await parent();
  const api = endpoints(fetch);
  const offered: FeedTab[] = user ? ["for-you", "local", "global"] : ["global", "local"];
  const saved = feedTab(cookies.get(FEED_COOKIE));
  const tab = saved && offered.includes(saved) ? saved : offered[0];
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
