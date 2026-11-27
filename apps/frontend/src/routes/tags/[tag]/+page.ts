// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "#lib/api/index.js";
import type { PageLoad } from "./$types";

// A tag page: its meta (counts + follow state) plus the first page of posts.
export const load: PageLoad = async ({ params, fetch }) => {
  let detail;
  let page;
  try {
    [detail, page] = await Promise.all([endpoints(fetch).tag(params.tag), endpoints(fetch).tagPosts(params.tag)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Tag not found");
    throw err;
  }

  // Aliased or differently cased slugs resolve to their canonical tag; redirect
  // permanently so every tag lives at one URL.
  if (params.tag !== detail.tag.slug) {
    redirect(308, `/tags/${encodeURIComponent(detail.tag.slug)}`);
  }

  return { detail, page };
};
