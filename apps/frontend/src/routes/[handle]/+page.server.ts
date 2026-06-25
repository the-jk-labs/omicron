// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
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
      const [profile, posts] = await Promise.all([
        api.remoteProfile(handle),
        api.remoteUserPosts(handle),
      ]);
      return { remote: true as const, profile, page: posts };
    }
    const [profile, posts] = await Promise.all([
      api.profile(handle),
      api.userPosts(handle),
    ]);
    return { remote: false as const, profile, page: posts };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "User not found");
    throw err;
  }
};