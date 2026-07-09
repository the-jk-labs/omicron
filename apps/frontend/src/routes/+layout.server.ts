// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "@sveltejs/kit";
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

  // First-run gate: until the instance is set up, every route is redirected to
  // the wizard; once set up, the wizard route redirects back into the app. If
  // the backend is unreachable we skip gating and let normal errors surface.
  const instance = await api.instance().catch(() => null);
  if (instance) {
    const onSetup = route.id === "/setup";
    if (!instance.setupComplete && !onSetup) redirect(303, "/setup");
    if (instance.setupComplete && onSetup) redirect(303, "/");
  }

  // Discoverability config drives the <head> verification tags + noindex. Public
  // and cheap; default to indexable if the backend hiccups.
  const seoPromise = api.seo().catch(() => ({ indexingEnabled: true, verification: {} }));

  const userPromise = api.me().then((r) => r.user).catch(() => null);
  const discoverPromise = DISCOVER_ROUTES.has(route.id ?? "")
    ? Promise.allSettled([api.trendingPosts(), api.suggestedUsers(), api.trendingTags()])
    : null;

  const user = await userPromise;

  let discover = null;
  if (discoverPromise) {
    // Each list is independent — a failure in one must not blank the others.
    const [p, u, t] = await discoverPromise;
    // Cap each list so the rail always fits within one viewport height and never
    // becomes a second scroll region alongside the page.
    discover = {
      posts: p.status === "fulfilled" ? p.value.items.slice(0, 4) : [],
      people: u.status === "fulfilled" ? u.value.items.slice(0, 3) : [],
      tags: t.status === "fulfilled" ? t.value.tags.slice(0, 6) : [],
    };
  }

  const seo = await seoPromise;

  return { user, discover, instance, seo };
};
