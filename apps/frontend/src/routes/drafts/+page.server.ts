import { endpoints } from "$lib/api";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Drafts are private to their author, so this page requires authentication.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  const page = await endpoints(fetch).drafts();
  return { page };
};
