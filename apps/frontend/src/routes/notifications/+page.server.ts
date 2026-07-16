// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import { endpoints } from "$lib/api";
import type { PageServerLoad } from "./$types";

// Notifications are private to the signed-in user, so this page requires auth.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  const page = await endpoints(fetch).notifications();
  return { page };
};
