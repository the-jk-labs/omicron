import type { DashboardSummary } from "@omicron/contract";
import type { IconName } from "@/components/ui/icon";

export type StatTile = { icon: IconName; label: string; value: number; allTime?: number };

/**
 * The stat tiles for the chosen period, each with its all-time figure beneath. An instance older than
 * `period` only has all-time totals, which then show alone.
 */
export function statTiles({ onInstanceViews, totals, period }: DashboardSummary): StatTile[] {
  const tile = (icon: IconName, label: string, key: keyof DashboardSummary["totals"]): StatTile =>
    period ? { icon, label, value: period[key], allTime: totals[key] } : { icon, label, value: totals[key] };
  return [
    ...(onInstanceViews ? [tile("eye", "Views", "views")] : []),
    tile("heart", "Likes", "likes"),
    tile("message-circle", "Comments", "comments"),
    tile("users", period ? "New followers" : "Followers", "followers"),
  ];
}
