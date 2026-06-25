// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageLoad } from "./$types";

// Writing requires authentication. With `?id=<draftId>` the page reopens an
// existing draft to continue editing or publish it; otherwise it's a blank draft.
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");

  const id = url.searchParams.get("id");
  if (!id) return { draft: null };

  try {
    const { post } = await endpoints(fetch).post(id);
    if (post.author.id !== user.id)
      error(403, "You can only edit your own drafts.");
    // Published posts are edited on their own edit page, not the compose screen.
    if (post.status !== "draft") redirect(302, `/posts/${post.id}/edit`);
    return { draft: post };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404)
      error(404, "Draft not found");
    throw err;
  }
};
