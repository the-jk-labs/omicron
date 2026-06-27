// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageLoad } from "./$types";

// A tag page: its meta (counts + follow state) plus the first page of posts.
export const load: PageLoad = async ({ params, fetch }) => {
  try {
    const [detail, page] = await Promise.all([
      endpoints(fetch).tag(params.tag),
      endpoints(fetch).tagPosts(params.tag),
    ]);
    return { detail, page };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Tag not found");
    throw err;
  }
};
