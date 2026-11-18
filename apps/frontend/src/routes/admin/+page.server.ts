// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { type AdminTab, asAdminTab, MODERATOR_TABS } from "#lib/adminTabs.js";
import { endpoints } from "#lib/api/index.js";
import type { EmailChangeRequest } from "#lib/types.js";
import type { PageServerLoad } from "./$types";

type Api = ReturnType<typeof endpoints>;
type Loaded<K extends keyof Api> = Awaited<ReturnType<Api[K]>> | null;

export type AdminInitial = {
  reports?: Loaded<"adminReports">;
  users?: {
    users: Loaded<"adminUsers">;
    deleted: Loaded<"deletedUsers">;
    emailChanges: EmailChangeRequest[] | null;
  };
  federation?: {
    network: Loaded<"federation">;
    domains: Loaded<"blockedDomains">;
    actors: Loaded<"blockedActors">;
  };
  email?: Loaded<"adminEmail">;
  security?: Loaded<"adminSecurity">;
  seo?: Loaded<"adminSeo">;
  unsplash?: Loaded<"adminUnsplash">;
  umami?: Loaded<"adminUmami">;
  instance?: { identity: Loaded<"adminInstance">; settings: Loaded<"adminSettings"> };
};

// A failed read is left to the browser, which then shows the error in place.
const ok = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

async function loadTab(api: Api, tab: AdminTab, isAdmin: boolean): Promise<AdminInitial> {
  switch (tab) {
    case "reports":
      return { reports: await ok(api.adminReports("open")) };
    case "users": {
      const [users, deleted, emailChanges] = await Promise.all([
        ok(api.adminUsers()),
        ok(api.deletedUsers()),
        isAdmin ? ok(api.emailChangeRequests().then((r) => r.items)) : Promise.resolve(null),
      ]);
      return { users: { users, deleted, emailChanges } };
    }
    case "federation": {
      const [network, domains, actors] = await Promise.all([
        ok(api.federation()),
        ok(api.blockedDomains()),
        ok(api.blockedActors()),
      ]);
      return { federation: { network, domains, actors } };
    }
    case "email":
      return { email: await ok(api.adminEmail()) };
    case "security":
      return { security: await ok(api.adminSecurity()) };
    case "discoverability":
      return { seo: await ok(api.adminSeo()) };
    case "media":
      return { unsplash: await ok(api.adminUnsplash()) };
    // "settings"
    default: {
      const [identity, settings, umami] = await Promise.all([
        ok(api.adminInstance()),
        ok(api.adminSettings()),
        ok(api.adminUmami()),
      ]);
      return { instance: { identity, settings }, umami };
    }
  }
}

// The admin area is moderator-and-up. Anonymous visitors are sent to sign in;
// signed-in regular users get a 403 rather than a silent redirect so the
// boundary is explicit. Which tabs a moderator may use is gated in +page.svelte.
// The open tab's data loads here so it renders with the page; the hidden tabs
// load in the browser.
export const load: PageServerLoad = async ({ parent, fetch, url }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");
  if (!user.isAdmin && !user.isModerator) error(403, "You don't have access to this page.");
  const tab = asAdminTab(url.searchParams.get("tab"));
  // Rendered here, not after load, so the setup screen is all that ever shows.
  if (user.twoFactorRequired && !user.twoFactorEnabled) {
    return { user, tab, initial: {}, needsTwoFactor: true };
  }
  const allowed = user.isAdmin || MODERATOR_TABS.includes(tab);
  const initial = allowed ? await loadTab(endpoints(fetch), tab, user.isAdmin) : {};
  return { user, tab, initial, needsTwoFactor: false };
};
