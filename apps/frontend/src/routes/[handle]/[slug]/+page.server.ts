// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import { deferBodyImages } from "$lib/bodyImages";
import { highlightCodeBlocks } from "$lib/highlight";
import { postPath } from "$lib/links";
import type { PageServerLoad } from "./$types";

// Blog post at /@username/<slug>. The slug is the address: the backend resolves
// it against the author's live slug, then against slugs the post has been moved
// off (a retitle), then against a trailing short id — which is what permalinks
// looked like before slugs (`<slug>-9e962281`) and what a remote or untitled
// post still uses. Anything that resolves but is not the canonical path — an
// old slug, an id link, a drifted handle — redirects to the current one, so a
// link shared years ago still arrives and search engines see a single URL.
export const load: PageServerLoad = async ({ fetch, locals, params, url }) => {
  const handle = params.handle.replace(/^@/, "");
  if (!handle || params.handle[0] !== "@") error(404, "Post not found");

  let data;
  try {
    const api = endpoints(fetch);
    const { post } = await api.postBySlug(handle, params.slug);
    // Comments and the read-next rail are independent of each other, so they go
    // out together. A failure in the rail must not cost the reader the article,
    // so it degrades to an empty list rather than propagating.
    const [comments, related] = await Promise.all([
      api.comments(post.id),
      api.relatedPosts(post.id).then((r) => r.items).catch(() => []),
    ]);
    // Highlighting is a read-time concern (see lib/highlight.ts): the stored
    // body stays the author's, and this decorates the copy on its way to the
    // reader. `post` is this request's own deserialized response, so writing to
    // it changes nothing but what this page renders. Only this page renders a
    // full body, so only this load pays for the work.
    post.contentHtml = deferBodyImages(highlightCodeBlocks(post.contentHtml));
    data = { post, comments, related };
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
