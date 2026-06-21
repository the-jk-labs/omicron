import { error } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params }) => {
  try {
    const api = endpoints(fetch);
    const [{ post }, comments] = await Promise.all([
      api.post(params.id),
      api.comments(params.id),
    ]);
    return { post, comments };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Post not found");
    throw err;
  }
};
