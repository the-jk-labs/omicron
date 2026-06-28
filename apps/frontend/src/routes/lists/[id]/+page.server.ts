// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import { listIdFromSlug, listPath } from "$lib/links";
import type { PageServerLoad } from "./$types";

// A reading list at /lists/<slug>-<id>. The trailing short id is authoritative;
// the slug is cosmetic and redirects to the canonical path when it drifts (e.g.
// after a rename). Public lists are visible to anyone; private lists 404 for
// everyone but their owner (the API enforces this).
export const load: PageServerLoad = async ({ fetch, params, url }) => {
  const id = listIdFromSlug(params.id);
  if (!id) error(404, "List not found");

  const api = endpoints(fetch);
  let data;
  try {
    // Resolve the list first (id may be a short prefix), then load its items.
    const [detail, page] = await Promise.all([api.list(id), api.listItems(id)]);
    data = { ...detail, page };
  } catch (err) {
    // 401 (private list, not the owner) is surfaced as 404 to avoid revealing it.
    if (err instanceof ApiError && (err.status === 404 || err.status === 401)) {
      error(404, "List not found");
    }
    throw err;
  }

  const canonical = listPath(data.list);
  if (decodeURIComponent(url.pathname) !== canonical) redirect(308, canonical);

  return data;
};
