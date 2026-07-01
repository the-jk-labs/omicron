// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { LayoutServerLoad } from "./$types";

// The discovery rail only renders on the home feed and profile pages (see
// +layout.svelte showDiscover), so only fetch its data there.
const DISCOVER_ROUTES = new Set(["/", "/[handle]"]);

// Resolves the current user once for every page (used by the nav + guards) and,
// on the routes that show it, the discovery rail — server-side, in parallel, so
// the rail renders with the page instead of popping in after client hydration.
export const load: LayoutServerLoad = async ({ fetch, route }) => {
  const api = endpoints(fetch);

  const userPromise = api.me().then((r) => r.user).catch(() => null);
  const discoverPromise = DISCOVER_ROUTES.has(route.id ?? "")
    ? Promise.allSettled([api.trendingPosts(), api.suggestedUsers(), api.trendingTags()])
    : null;

  const user = await userPromise;

  let discover = null;
  if (discoverPromise) {
    // Each list is independent — a failure in one must not blank the others.
    const [p, u, t] = await discoverPromise;
    discover = {
      posts: p.status === "fulfilled" ? p.value.items : [],
      people: u.status === "fulfilled" ? u.value.items : [],
      tags: t.status === "fulfilled" ? t.value.tags.slice(0, 8) : [],
    };
  }

  return { user, discover };
};
