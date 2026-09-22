// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// The admin area is moderator-and-up. Anonymous visitors are sent to sign in;
// signed-in regular users get a 403 rather than a silent redirect so the
// boundary is explicit. Which tabs a moderator may use is gated in +page.svelte.
export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  if (!user.isAdmin && !user.isModerator) error(403, "You don't have access to this page.");
  return { user };
};
