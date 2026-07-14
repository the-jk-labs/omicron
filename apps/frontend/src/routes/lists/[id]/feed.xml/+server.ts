// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { ApiError, endpoints } from "$lib/api";
import { listIdFromSlug, listPath } from "$lib/links";
import { FEED_HEADERS, postFeedItem, renderRssFeed } from "$lib/rss";
import type { RequestHandler } from "./$types";

// A reading list's RSS feed at /lists/<slug>-<id>/feed.xml.
//
// Only public lists are reachable: the API scopes a private list to its owner
// and a feed reader is anonymous, so its request 404s the same way the page
// does. Unlike the page this never redirects on slug drift — a subscribed
// reader's feed URL must keep working after a rename, and the trailing short id
// is what actually resolves the list.
export const GET: RequestHandler = async ({ fetch, params, url }) => {
  const id = listIdFromSlug(params.id);
  if (!id) error(404, "List not found");

  const api = endpoints(fetch);
  const [instance, { indexingEnabled }] = await Promise.all([
    api.instance().catch(() => null),
    api.seo().catch(() => ({ indexingEnabled: true })),
  ]);
  const appName = instance?.name || "Omicron";

  let detail;
  try {
    detail = await api.list(id);
  } catch (err) {
    // 401 (private list, not the owner) is surfaced as 404 to avoid revealing it.
    if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
      error(404, "List not found");
    }
    throw err;
  }

  const items = indexingEnabled ? (await api.listItems(detail.list.id)).items : [];

  const body = renderRssFeed({
    title: `${detail.list.title} · ${appName}`,
    description: detail.list.description ||
      `A reading list by ${detail.owner.displayName} on ${appName}`,
    link: `${url.origin}${listPath(detail.list)}`,
    feedUrl: url.href,
    items: items.map((post) => postFeedItem(post, url.origin)),
  });

  return new Response(body, { headers: FEED_HEADERS });
};
