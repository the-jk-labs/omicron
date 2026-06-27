// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { PageLoad } from "./$types";

// Read the query from the URL and fetch both stories and people in one call.
// A blank query renders the empty prompt without hitting the API.
export const load: PageLoad = async ({ url, fetch }) => {
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!query) return { query, results: { posts: [], people: [] } };
  const results = await endpoints(fetch).search(query);
  return { query, results };
};
