// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
import { COMPOSE_LANG_COOKIE, composeLangFor } from "#lib/prefs.svelte.js";
import type { PageServerLoad } from "./$types";

// Writing requires authentication. The default article language is worked out
// here so the picker renders with it instead of switching after hydration.
export const load: PageServerLoad = async ({ parent, cookies, request }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  return { composeLang: composeLangFor(cookies.get(COMPOSE_LANG_COOKIE), request.headers.get("accept-language")) };
};
