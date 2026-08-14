import { endpoints, ApiError } from "$lib/api";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Profile page at /@username (local) or /@user@host (remote). The leading "@"
// is stripped; a remaining "@" marks a remote, federated actor.
export const load: PageServerLoad = async ({ fetch, params }) => {
  const handle = params.handle.replace(/^@/, "");
  if (!handle || params.handle[0] !== "@") error(404, "Not found");
  const api = endpoints(fetch);
  const isRemote = handle.includes("@");
  try {
    if (isRemote) {
      const [profile, posts, recommendations] = await Promise.all([
        api.remoteProfile(handle),
        api.remoteUserPosts(handle),
        api.remoteUserRecommendations(handle),
      ]);
      return { remote: true as const, profile, page: posts, recommendations };
    }
    const [profile, posts, lists, recommendations] = await Promise.all([
      api.profile(handle),
      api.userPosts(handle),
      // Public lists (plus the owner's private ones, when they're the viewer).
      api.userLists(handle),
      api.userRecommendations(handle),
    ]);
    return { remote: false as const, profile, page: posts, lists: lists.lists, recommendations };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "User not found");
    throw err;
  }
};
