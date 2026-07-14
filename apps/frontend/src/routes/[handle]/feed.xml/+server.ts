// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { ApiError, endpoints } from "$lib/api";
import { FEED_HEADERS, postFeedItem, renderRssFeed } from "$lib/rss";
import type { RequestHandler } from "./$types";

// A writer's RSS feed at /@username/feed.xml — this route wins over the
// sibling [slug] post route because a static segment beats a dynamic one.
//
// Local authors only: a remote actor's posts belong to their own instance,
// which serves (or doesn't serve) its own feed. Empty when the admin has
// indexing off, mirroring sitemap.xml — a private instance syndicates nothing.
export const GET: RequestHandler = async ({ fetch, params, url }) => {
  const handle = params.handle.replace(/^@/, "");
  if (!handle || params.handle[0] !== "@" || handle.includes("@")) error(404, "Not found");

  const api = endpoints(fetch);
  const [instance, { indexingEnabled }] = await Promise.all([
    api.instance().catch(() => null),
    api.seo().catch(() => ({ indexingEnabled: true })),
  ]);
  const appName = instance?.name || "Omicron";

  let profile;
  try {
    profile = await api.profile(handle);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "User not found");
    throw err;
  }

  const posts = indexingEnabled ? (await api.userPosts(handle)).items : [];
  const author = profile.user;

  const body = renderRssFeed({
    title: `${author.displayName} · ${appName}`,
    description: author.bio || `Stories by @${author.username} on ${appName}`,
    link: `${url.origin}/@${author.username}`,
    feedUrl: url.href,
    items: posts.map((post) => postFeedItem(post, url.origin)),
  });

  return new Response(body, { headers: FEED_HEADERS });
};
