import { endpoints, ApiError } from "$lib/api";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

// Writing requires authentication. With `?id=<postId>` the page reopens an
// existing unpublished post — a draft, or one waiting for its scheduled moment
// — to keep editing, reschedule or publish it; otherwise it's a blank draft.
export const load: PageLoad = async ({ fetch, url, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");

  const id = url.searchParams.get("id");
  if (!id) return { draft: null };

  try {
    const { post } = await endpoints(fetch).post(id);
    if (post.author.id !== user.id) error(403, "You can only edit your own drafts.");
    // Published posts are edited on their own edit page, not the compose screen.
    // A scheduled one belongs here: it is still unpublished, and the composer is
    // where its timing is changed as well as its text.
    if (post.status === "published") redirect(302, `/posts/${post.id}/edit`);
    return { draft: post };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Draft not found");
    throw err;
  }
};
