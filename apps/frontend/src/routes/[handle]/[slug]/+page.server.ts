// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import { highlightCodeBlocks } from "$lib/highlight";
import { postIdFromSlug, postPath } from "$lib/links";
import type { PageServerLoad } from "./$types";

// Blog post at /@username/<slug>-<uuid>. The trailing UUID is authoritative;
// the slug and handle are cosmetic and redirect to the canonical path when they
// drift (e.g. after a rename or a hand-typed link).
export const load: PageServerLoad = async ({ fetch, locals, params, url }) => {
  const id = postIdFromSlug(params.slug);
  if (!id) error(404, "Post not found");

  let data;
  try {
    const api = endpoints(fetch);
    // Resolve the post first (id may be a short prefix), then load its comments
    // by the full id.
    const { post } = await api.post(id);
    const comments = await api.comments(post.id);
    // Highlighting is a read-time concern (see lib/highlight.ts): the stored
    // body stays the author's, and this decorates the copy on its way to the
    // reader. `post` is this request's own deserialized response, so writing to
    // it changes nothing but what this page renders. Only this page renders a
    // full body, so only this load pays for the work.
    post.contentHtml = highlightCodeBlocks(post.contentHtml);
    data = { post, comments };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "Post not found");
    throw err;
  }

  const canonical = postPath(data.post);
  if (decodeURIComponent(url.pathname) !== canonical) redirect(308, canonical);

  // The body is the page here, so the author's declared language is the page's
  // language. hooks.server.ts validates the tag and writes it into <html lang>.
  locals.lang = data.post.language ?? null;

  return data;
};
