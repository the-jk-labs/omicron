// SPDX-License-Identifier: AGPL-3.0-or-later
import { error, redirect } from "@sveltejs/kit";
import { type AdminTab, asAdminTab, MODERATOR_TABS } from "#lib/adminTabs.js";
import { endpoints } from "#lib/api/index.js";
import type { PageServerLoad } from "./$types";

type Api = ReturnType<typeof endpoints>;
type Loaded<K extends keyof Api> = Awaited<ReturnType<Api[K]>> | null;

export type AdminInitial = {
  reports?: Loaded<"adminReports">;
  users?: { users: Loaded<"adminUsers">; deleted: Loaded<"deletedUsers"> };
  domains?: Loaded<"blockedDomains">;
  email?: Loaded<"adminEmail">;
  security?: Loaded<"adminSecurity">;
  seo?: Loaded<"adminSeo">;
  unsplash?: Loaded<"adminUnsplash">;
  instance?: { identity: Loaded<"adminInstance">; settings: Loaded<"adminSettings"> };
};

// A failed read is left to the browser, which then shows the error in place.
const ok = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

async function loadTab(api: Api, tab: AdminTab): Promise<AdminInitial> {
  switch (tab) {
    case "reports":
      return { reports: await ok(api.adminReports("open")) };
    case "users": {
      const [users, deleted] = await Promise.all([ok(api.adminUsers()), ok(api.deletedUsers())]);
      return { users: { users, deleted } };
    }
    case "federation":
      return { domains: await ok(api.blockedDomains()) };
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
      const [identity, settings] = await Promise.all([ok(api.adminInstance()), ok(api.adminSettings())]);
      return { instance: { identity, settings } };
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
  const allowed = user.isAdmin || MODERATOR_TABS.includes(tab);
  const initial = allowed ? await loadTab(endpoints(fetch), tab) : {};
  return { user, tab, initial };
};
