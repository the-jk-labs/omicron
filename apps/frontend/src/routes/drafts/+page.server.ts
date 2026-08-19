// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// Drafts moved into the tabbed management page when scheduled posts arrived and
// there was more than one kind of unpublished post to show. This address was
// linked from the nav for a long time and is in the documentation, so it keeps
// working rather than 404ing on anyone's bookmark.
export const load: PageServerLoad = () => {
  redirect(308, "/posts/manage?tab=draft");
};
