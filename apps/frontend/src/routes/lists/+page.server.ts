// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import { endpoints } from "$lib/api";
import type { PageServerLoad } from "./$types";

// A user's own reading lists are private to manage, so this page requires auth.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  const { lists } = await endpoints(fetch).myLists();
  return { lists };
};
