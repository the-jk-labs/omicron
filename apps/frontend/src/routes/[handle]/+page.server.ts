import { error } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageServerLoad } from "./$types";

// Profile page at /@username. The leading "@" is stripped from the route param.
export const load: PageServerLoad = async ({ fetch, params }) => {
  const handle = params.handle.replace(/^@/, "");
  if (!handle || params.handle[0] !== "@") error(404, "Not found");
  try {
    const api = endpoints(fetch);
    const [profile, posts] = await Promise.all([
      api.profile(handle),
      api.userPosts(handle),
    ]);
    return { profile, page: posts };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "User not found");
    throw err;
  }
};
