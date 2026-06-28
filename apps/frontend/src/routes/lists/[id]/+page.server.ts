// SPDX-License-Identifier: AGPL-3.0-or-later
import { error } from "@sveltejs/kit";
import { endpoints, ApiError } from "$lib/api";
import type { PageServerLoad } from "./$types";

// A reading list and its posts. Public lists are visible to anyone; private
// lists 404 for everyone but their owner (the API enforces this).
export const load: PageServerLoad = async ({ fetch, params }) => {
  const api = endpoints(fetch);
  try {
    const [detail, page] = await Promise.all([
      api.list(params.id),
      api.listItems(params.id),
    ]);
    return { ...detail, page };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error(404, "List not found");
    if (err instanceof ApiError && err.status === 401) error(404, "List not found");
    throw err;
  }
};
