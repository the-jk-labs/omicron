// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import { endpoints } from "$lib/api";
import type { PageServerLoad } from "./$types";

// A writer's analytics for their own posts — auth required. The backend scopes
// everything to the signed-in author; no reader identities are ever returned.
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  const summary = await endpoints(fetch).dashboard();
  return { summary };
};
