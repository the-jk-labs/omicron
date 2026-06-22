import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageServerLoad } from "./$types";

// Editing requires authentication and ownership of a local post.
export const load: PageServerLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");

  try {
    const { post } = await endpoints(fetch).post(params.id);
    if (post.remote) error(403, "Federated posts cannot be edited here.");
    if (post.author.id !== user.id) error(403, "You can only edit your own posts.");
    return { post };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Post not found");
    throw err;
  }
};
