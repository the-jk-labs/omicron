import { redirect } from "@sveltejs/kit";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "#lib/api/index.js";
import { LOCALE_COOKIE, localeFromAcceptLanguage, validLocale } from "#lib/locale.svelte.js";
import { feedFilterFrom } from "#lib/prefs.svelte.js";
import { currentUser } from "#lib/server/currentUser.js";
import { TZ_COOKIE, validTimeZone } from "#lib/timezone.svelte.js";
import type { LayoutServerLoad } from "./$types";

// The discovery rail only renders on the home feed and profile pages (see
// +layout.svelte showDiscover), so only fetch its data there.
const DISCOVER_ROUTES = new Set(["/", "/[handle]"]);

// Resolves the current user once for every page (used by the nav + guards) and,
// on the routes that show it, the discovery rail — server-side, in parallel, so
// the rail renders with the page instead of popping in after client hydration.
export const load: LayoutServerLoad = async ({ cookies, fetch, locals, route, request }) => {
  const api = endpoints(fetch);

  // The reader's own timezone, parked in a cookie by the browser on their last
  // visit, so dates render server-side in the zone they'll still be in after
  // hydration instead of flipping from UTC. See $lib/timezone.
  const timeZone = validTimeZone(cookies.get(TZ_COOKIE));

  // Locale for date formatting: cookie wins, then Accept-Language, then fallback.
  // Mirrors `timezone.ts` — server and client must agree or the timestamp
  // flickers between `Aug 18` and `18 avq` on hydration.
  const locale =
    validLocale(cookies.get(LOCALE_COOKIE)) ?? localeFromAcceptLanguage(request.headers.get("accept-language")) ?? null;

  // Every backend call starts at once; the first-run gate below only awaits the
  // instance, so a page pays one round trip instead of two in a row. Each call
  // has its own fallback, so one abandoned by a redirect never rejects unhandled.
  const instancePromise = api.instance().catch(() => null);
  // Discoverability config drives the <head> verification tags + noindex. Public
  // and cheap; default to indexable if the backend hiccups.
  const seoPromise = api.seo().catch(() => ({ indexingEnabled: true, verification: {} }));
  const umamiPromise = api.siteStatistics().catch(() => ({ websiteId: null }));
  const userPromise = currentUser({ locals, fetch });
  const discoverPromise = DISCOVER_ROUTES.has(route.id ?? "")
    ? Promise.allSettled([api.trendingPosts(), api.suggestedUsers(), api.trendingTags()])
    : null;

  // First-run gate: until the instance is set up, every route is redirected to
  // the wizard; once set up, the wizard route redirects back into the app. If
  // the backend is unreachable we skip gating and let normal errors surface.
  const instance = await instancePromise;
  if (instance) {
    const onSetup = route.id === "/setup";
    if (!instance.setupComplete && !onSetup) redirect(303, "/setup");
    if (instance.setupComplete && onSetup) redirect(303, "/");
  }

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
  const umami = {
    ...(await umamiPromise),
    allowed: request.headers.get("dnt") !== "1" && request.headers.get("sec-gpc") !== "1",
  };

  // The feed language filter, so its card and switches render as saved.
  const feedFilter = feedFilterFrom((name) => cookies.get(name));

  return { user, discover, instance, seo, umami, timeZone, locale, feedFilter };
};
