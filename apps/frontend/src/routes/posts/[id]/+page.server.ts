import { error } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, params }) => {
  try {
    const { post } = await endpoints(fetch).post(params.id);
    return { post };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Post not found");
    throw err;
  }
};
