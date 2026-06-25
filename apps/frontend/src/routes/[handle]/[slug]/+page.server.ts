// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import { postIdFromSlug, postPath } from "$lib/links";
import type { PageServerLoad } from "./$types";

// Blog post at /@username/<slug>-<uuid>. The trailing UUID is authoritative;
// the slug and handle are cosmetic and redirect to the canonical path when they
// drift (e.g. after a rename or a hand-typed link).
export const load: PageServerLoad = async ({ fetch, params, url }) => {
  const id = postIdFromSlug(params.slug);
  if (!id) error(404, "Post not found");

  let data;
  try {
    const api = endpoints(fetch);
    // Resolve the post first (id may be a short prefix), then load its comments
    // by the full id.
    const { post } = await api.post(id);
    const comments = await api.comments(post.id);
    data = { post, comments };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Post not found");
    throw err;
  }

  const canonical = postPath(data.post);
  if (decodeURIComponent(url.pathname) !== canonical) redirect(308, canonical);

  return data;
};
