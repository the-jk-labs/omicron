// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { OwnPostStatus } from "$lib/types";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

const TABS: OwnPostStatus[] = ["draft", "scheduled", "published"];

// `?tab=` is reader-supplied, so it is checked rather than trusted: an unknown
// value falls back to Drafts instead of being passed through to the API.
function tabFrom(raw: string | null): OwnPostStatus {
  return TABS.find((t) => t === raw) ?? "draft";
}

// An author's own posts are private to them, so this page requires
// authentication. Only the requested tab is fetched; the other two load when
// they are first opened, so arriving here costs one query and not three.
export const load: PageServerLoad = async ({ fetch, parent, url }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");

  const tab = tabFrom(url.searchParams.get("tab"));

  const [page, counts] = await Promise.all([endpoints(fetch).ownPosts(tab), endpoints(fetch).ownPostCounts()]);
  return { tab, page, counts };
};
