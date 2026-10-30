import type { DayTotals, PostStat } from "@omicron/contract";
import { useQueries } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { useTabBarInset } from "@/components/layout/tab-bar";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { PillTabs } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { useViewer } from "@/lib/auth/session";
import { postPath } from "@/lib/links";
import { queryKeys } from "@/lib/query/keys";
import { statTiles, type StatTile } from "@/lib/stats";

const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
const DAY = 86_400_000;
const compact = new Intl.NumberFormat(undefined, { notation: "compact" });
const fmt = (n: number) => compact.format(n);

function StatCard({ icon, label, value, allTime }: StatTile) {
  return (
    <Card className="min-w-[46%] flex-1 gap-2 p-4">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={15} className="text-muted-foreground" />
        <Text size="sm" tone="muted">
          {label}
        </Text>
      </View>
      <View className="gap-0.5">
        <Text size="2xl" weight="bold">
          {fmt(value)}
        </Text>
        {allTime !== undefined && (
          <Text size="xs" tone="muted">
            {fmt(allTime)} all time
          </Text>
        )}
      </View>
    </Card>
  );
}

/** Views over time as a filled line; a flat baseline of 1 avoids dividing by zero on a quiet range. */
function ViewsChart({ series, width }: { series: DayTotals[]; width: number }) {
  const [stroke, fill] = useThemeColors(["--color-foreground", "--color-dark-10"]);
  const height = 140;
  const max = Math.max(1, ...series.map((d) => d.views));
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series.map((d, i) => [i * step, height - (d.views / max) * (height - 8) - 4] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      {points.length > 1 && <Path d={`${line} L${width},${height} L0,${height} Z`} fill={fill} />}
      <Path d={line} stroke={stroke} strokeWidth={2} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}

function PostRow({ stat, username, now }: { stat: PostStat; username: string; now: number }) {
  const days = Math.max(1, (now - new Date(stat.createdAt).getTime()) / DAY);
  return (
    <Link href={postPath({ id: stat.postId, slug: stat.slug, author: { username } })} asChild>
      <PressableScale pressedScale={0.99} className="gap-1 border-b border-border py-3">
        <Text weight="medium" numberOfLines={2}>
          {stat.title || "Untitled"}
        </Text>
        <Text size="xs" tone="muted">
          {fmt(stat.views)} views · {fmt(stat.likes)} likes · {fmt(stat.comments)} comments ·{" "}
          {((stat.likes + stat.comments) / days).toFixed(1)}/day
        </Text>
      </PressableScale>
    </Link>
  );
}

/** Writer stats, the web's /dashboard. */
export default function Stats() {
  const api = useApi();
  const { user } = useViewer();
  const bottomInset = useTabBarInset();
  const { width } = useWindowDimensions();
  const [now] = useState(Date.now);
  const [days, setDays] = useState<(typeof RANGES)[number]["value"]>("30");
  // Every range loads together, so switching between them never waits.
  const queries = useQueries({
    queries: RANGES.map(({ value }) => ({
      queryKey: queryKeys.dashboard(Number(value)),
      queryFn: () => api.dashboard(Number(value)),
    })),
  });
  const query = queries[RANGES.findIndex((range) => range.value === days)];
  const data = query.data;
  const rangeTotal = data?.series.reduce((sum, d) => sum + d.views, 0) ?? 0;

  return (
    <Screen>
      <ScreenHeader back={false} title="Stats" />
      <ScrollView
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
        refreshControl={<PullToRefresh onRefresh={() => Promise.all(queries.map((q) => q.refetch()))} />}
      >
        <PillTabs tabs={RANGES} value={days} onChange={setDays} className="self-center" />
        {!data ? (
          query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <LoadingState />
          )
        ) : (
          <>
            <View className="flex-row flex-wrap gap-3">
              {statTiles(data).map((tile) => (
                <StatCard key={tile.label} {...tile} />
              ))}
            </View>
            {data.onInstanceViews && (
              <Card className="gap-3">
                <View className="flex-row items-baseline justify-between">
                  <Text weight="semibold">Views</Text>
                  <Text size="xs" tone="muted">
                    {fmt(rangeTotal)} in the last {data.series.length} days
                  </Text>
                </View>
                <ViewsChart series={data.series} width={width - 66} />
              </Card>
            )}
            <Card className="py-1">
              <View className="flex-row items-baseline justify-between pt-3 pb-1">
                <Text weight="semibold">Your stories</Text>
                <Text size="xs" tone="muted">
                  All time
                </Text>
              </View>
              {data.posts.length === 0 ? (
                <Text size="sm" tone="muted" className="py-3">
                  Publish a story to see how it does.
                </Text>
              ) : (
                [...data.posts]
                  .sort((a, b) => b.views - a.views || b.likes - a.likes)
                  .map((stat) => <PostRow key={stat.postId} stat={stat} username={user?.username ?? ""} now={now} />)
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
