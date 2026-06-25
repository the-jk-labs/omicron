// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import { postPath } from "$lib/links";
import type { PageServerLoad } from "./$types";

// Legacy permalink. Posts now live at /@username/<slug>-<uuid>; resolve the id
// and redirect so old /posts/<id> links keep working.
export const load: PageServerLoad = async ({ fetch, params }) => {
  try {
    const { post } = await endpoints(fetch).post(params.id);
    redirect(308, postPath(post));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Post not found");
    throw err;
  }
};
