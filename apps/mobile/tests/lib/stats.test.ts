import type { DashboardSummary } from "@omicron/contract";
import { describe, expect, test } from "vitest";
import { statTiles } from "@/lib/stats";

const summary = (over: Partial<DashboardSummary> = {}): DashboardSummary => ({
  onInstanceViews: true,
  totals: { views: 100, likes: 20, comments: 5, followers: 9 },
  period: { days: 7, views: 12, likes: 3, comments: 1, followers: 2 },
  series: [],
  posts: [],
  ...over,
});

describe("statTiles", () => {
  test("shows the period's numbers with all-time beneath", () => {
    expect(statTiles(summary())).toEqual([
      { icon: "eye", label: "Views", value: 12, allTime: 100 },
      { icon: "heart", label: "Likes", value: 3, allTime: 20 },
      { icon: "message-circle", label: "Comments", value: 1, allTime: 5 },
      { icon: "users", label: "New followers", value: 2, allTime: 9 },
    ]);
  });

  test("leaves views out when the instance doesn't count them", () => {
    expect(statTiles(summary({ onInstanceViews: false })).map((t) => t.label)).not.toContain("Views");
  });

  test("an instance without period figures shows its all-time totals alone", () => {
    expect(statTiles(summary({ period: undefined }))).toEqual([
      { icon: "eye", label: "Views", value: 100 },
      { icon: "heart", label: "Likes", value: 20 },
      { icon: "message-circle", label: "Comments", value: 5 },
      { icon: "users", label: "Followers", value: 9 },
    ]);
  });
});
