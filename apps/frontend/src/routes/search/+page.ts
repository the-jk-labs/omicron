// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { PageLoad } from "./$types";

// Read the query from the URL and fetch both articles and people in one call.
// A blank query renders the empty prompt without hitting the API. `tag` and
// `author` narrow only the posts side (see backend routes/search.ts).
export const load: PageLoad = async ({ url, fetch }) => {
  const query = (url.searchParams.get("q") ?? "").trim();
  const tag = (url.searchParams.get("tag") ?? "").trim() || undefined;
  const author = (url.searchParams.get("author") ?? "").trim() || undefined;
  if (!query) return { query, tag, author, results: { posts: [], people: [], tags: [] } };
  const results = await endpoints(fetch).search(query, { tag, author });
  return { query, tag, author, results };
};
