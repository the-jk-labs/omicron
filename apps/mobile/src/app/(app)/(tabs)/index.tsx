import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useUniwind } from "uniwind";
import { useApi, useInstance } from "@/components/instance-provider";
import { Screen } from "@/components/layout/screen";
import { PostList } from "@/components/post/post-list";
import { CountBadge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/button";
import { UnderlineTabs, type TabItem } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import type { FeedTab } from "@/lib/api/endpoints";
import { useViewer } from "@/lib/auth/session";
import { homeFeed, useDefaultFeed, useFeedLangFilter } from "@/lib/prefs";
import { queryKeys } from "@/lib/query/keys";
import { useUnreadCount } from "@/lib/query/notifications";
import { usePagedQuery } from "@/lib/query/paged";
import logoDark from "../../../../assets/images/splash-dark.png";
import logoLight from "../../../../assets/images/splash-light.png";

const MEMBER_FEEDS: TabItem<FeedTab>[] = [
  { value: "for-you", label: "For you", icon: "sparkles" },
  { value: "local", label: "Local", icon: "users" },
  { value: "global", label: "Global", icon: "globe" },
];
const GUEST_FEEDS = MEMBER_FEEDS.slice(1);

export default function Home() {
  const api = useApi();
  const { name } = useInstance();
  const { theme } = useUniwind();
  const { signedIn } = useViewer();
  const [defaultFeed] = useDefaultFeed();
  const [langFilter] = useFeedLangFilter();
  const unread = useUnreadCount(signedIn);
  const feeds = signedIn ? MEMBER_FEEDS : GUEST_FEEDS;
  const [chosen, setChosen] = useState<FeedTab | null>(null);
  const tab = homeFeed(chosen ?? defaultFeed, signedIn);

  // The language filter applies to the public timelines only; For you is already the reader's own choice.
  const langs = tab === "for-you" ? null : langFilter;
  const query = usePagedQuery(queryKeys.feed(tab, langs), (cursor) =>
    tab === "for-you"
      ? api.feed(cursor)
      : tab === "local"
        ? api.localTimeline(cursor, langs)
        : api.globalTimeline(cursor, langs),
  );

  return (
    <Screen>
      {/* App header: the logo, the instance in the middle, alerts and search on the right. The two sides share a
          width so the name stays centred. */}
      <View className="h-14 flex-row items-center px-2">
        <View className="w-24 items-start">
          <Image source={theme === "dark" ? logoDark : logoLight} style={{ width: 32, height: 32, marginLeft: 6 }} />
        </View>
        <Text size="lg" weight="bold" numberOfLines={1} className="flex-1 text-center">
          {name}
        </Text>
        <View className="w-24 flex-row items-center justify-end">
          {signedIn && (
            <View>
              <IconButton
                icon="bell"
                label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
                onPress={() => router.push("/notifications")}
              />
              <View pointerEvents="none" className="absolute top-2 right-2">
                <CountBadge count={unread} />
              </View>
            </View>
          )}
          <IconButton icon="search" label="Search" onPress={() => router.push("/search")} />
        </View>
      </View>
      <UnderlineTabs tabs={feeds} value={tab} onChange={setChosen} />
      <PostList
        key={tab}
        query={query}
        empty={
          tab === "for-you"
            ? { title: "Your feed is empty", description: "Follow writers and tags to fill it." }
            : { title: "No posts yet", description: "Nothing has been published here yet." }
        }
      />
    </Screen>
  );
}
