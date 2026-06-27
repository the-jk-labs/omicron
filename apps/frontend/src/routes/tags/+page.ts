// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { PageLoad } from "./$types";

// Tag discovery: trending tags, plus the signed-in user's followed tags.
export const load: PageLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  const [{ tags: trending }, followed] = await Promise.all([
    endpoints(fetch).trendingTags(),
    user ? endpoints(fetch).followedTags() : Promise.resolve({ tags: [] }),
  ]);
  return { trending, followed: followed.tags };
};
