// SPDX-License-Identifier: AGPL-3.0-or-later
import { endpoints } from "$lib/api";
import type { OwnPostStatus } from "$lib/types";
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

const TABS: OwnPostStatus[] = ["draft", "scheduled", "published"];

// `?tab=` is reader-supplied, so it is checked rather than trusted: an unknown
// value is treated as if none had been given rather than passed to the API.
function tabFrom(raw: string | null): OwnPostStatus | null {
  return TABS.find((t) => t === raw) ?? null;
}

/**
 * Which tab to open when the URL does not say.
 *
 * The first one that holds anything, in writing order. Always opening Drafts
 * meant a writer who keeps none — publishes straight from the composer, or has
 * just cleared the last one — arrived at a page reporting they had written
 * nothing, with their actual work one unmarked click away. Falls back to Drafts
 * when everything is empty, since that is where a first post begins.
 */
function firstUsefulTab(counts: Record<OwnPostStatus, number>): OwnPostStatus {
  return TABS.find((t) => counts[t] > 0) ?? "draft";
}

// An author's own posts are private to them, so this page requires
// authentication. Only the chosen tab is fetched; the other two load when they
// are first opened, so arriving here costs two queries and not four.
export const load: PageServerLoad = async ({ fetch, parent, url }) => {
  const { user } = await parent();
  if (!user) redirect(302, "/login");

  const requested = tabFrom(url.searchParams.get("tab"));
  // An explicit tab always wins, and is honoured without waiting on the counts.
  // Only the bare `/posts/manage` has to read them first to know where to land.
  const counts = await endpoints(fetch).ownPostCounts();
  const tab = requested ?? firstUsefulTab(counts);

  return { tab, page: await endpoints(fetch).ownPosts(tab), counts };
};
