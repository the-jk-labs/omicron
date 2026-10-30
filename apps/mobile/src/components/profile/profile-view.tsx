import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { Post, ReadingList } from "@omicron/contract";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createContext, use, useState } from "react";
import { View } from "react-native";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import { useApi } from "@/components/instance-provider";
import { AccountMenu } from "@/components/layout/account-menu";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { useTabBarInset, useTabBarScrollOffset } from "@/components/layout/tab-bar";
import { ListCard } from "@/components/lists/list-card";
import { PostCard } from "@/components/post/post-card";
import { PostListEmpty } from "@/components/post/post-list";
import { HtmlContent } from "@/components/reader/html-content";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { MenuSheet, useSheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, ListFooter, LoadingState } from "@/components/ui/states";
import { UnderlineTabs, type TabItem } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { useRequireSignIn } from "@/lib/query/engagement";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";
import { useProfile, useRelation, type ProfileData } from "@/lib/query/profile";
import { ProfileHeader } from "./profile-header";

type Tab = "articles" | "lists" | "recommendations" | "about";

function ProfileMenu({ profile }: { profile: ProfileData }) {
  const api = useApi();
  const relation = useRelation(profile.user.username);
  const sheet = useSheet();
  const requireSignIn = useRequireSignIn();
  const name = `@${profile.user.username}`;
  const block = async () => {
    if (
      !profile.isBlocked &&
      !(await confirm({
        title: `Block ${name}?`,
        description: "They won't be able to follow you or see your posts, and you won't see theirs.",
        confirmText: "Block",
        destructive: true,
      }))
    )
      return;
    relation.mutate({ relation: "block", on: !profile.isBlocked });
  };

  const report = async () => {
    const confirmed = await confirm({
      title: `Report ${name}?`,
      description: "The instance's moderators will review it.",
      confirmText: "Report",
    });
    if (!confirmed) return;
    await api.report("user", profile.user.id).then(
      () => toast("Thanks, the moderators will take a look."),
      (error: unknown) => toast(errorMessage(error), "error"),
    );
  };
  return (
    <>
      <IconButton
        className="size-9 border border-input"
        size={16}
        iconClassName="text-foreground"
        icon="ellipsis-vertical"
        label="Profile options"
        onPress={sheet.present}
      />
      <MenuSheet
        sheetRef={sheet.ref}
        items={[
          {
            label: profile.isMuted ? `Unmute ${name}` : `Mute ${name}`,
            icon: profile.isMuted ? "volume-2" : "volume-x",
            onPress: () => requireSignIn(() => relation.mutate({ relation: "mute", on: !profile.isMuted })),
          },
          {
            label: profile.isBlocked ? `Unblock ${name}` : `Block ${name}`,
            icon: "ban",
            destructive: !profile.isBlocked,
            onPress: () => requireSignIn(() => void block()),
          },
          {
            label: "Report",
            icon: "flag",
            hidden: profile.remote,
            onPress: () => requireSignIn(() => void report()),
          },
        ]}
      />
    </>
  );
}

type Row =
  | { kind: "post"; id: string; post: Post }
  | { kind: "list"; id: string; list: ReadingList }
  | { kind: "about"; id: "about" };

const ProfileUserContext = createContext<ProfileData["user"] | null>(null);

function ProfileAbout() {
  const user = use(ProfileUserContext);
  if (!user) return null;
  const section = "customSectionHtml" in user ? user.customSectionHtml : "";
  const email = "publicEmail" in user ? user.publicEmail : "";
  if (!section && !email) return <EmptyState icon="user" title="Nothing here yet" />;
  return (
    <View className="gap-4 px-4 pt-2">
      {section ? <HtmlContent html={section} /> : null}
      {email ? (
        <View className="flex-row items-center gap-2">
          <Icon name="mail" size={14} className="text-muted-foreground" />
          <Text size="sm" tone="muted">
            {email}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function renderRow({ item }: { item: Row }) {
  switch (item.kind) {
    case "post":
      return <PostCard post={item.post} />;
    case "list":
      return (
        <View className="px-4 pt-3">
          <ListCard list={item.list} />
        </View>
      );
    default:
      return <ProfileAbout />;
  }
}
const rowKey = (row: Row) => `${row.kind}:${row.id}`;
const rowType = (row: Row) => row.kind;

const LOCAL_TABS: TabItem<Tab>[] = [
  { value: "articles", label: "Articles" },
  { value: "lists", label: "Lists" },
  { value: "recommendations", label: "Recommended" },
  { value: "about", label: "About" },
];
const REMOTE_TABS = LOCAL_TABS.filter((tab) => tab.value === "articles" || tab.value === "recommendations");

function fetchProfilePosts(
  api: ReturnType<typeof useApi>,
  username: string,
  remote: boolean,
  recommendations: boolean,
  cursor: string | null,
) {
  if (remote)
    return recommendations ? api.remoteUserRecommendations(username, cursor) : api.remoteUserPosts(username, cursor);
  return recommendations ? api.userRecommendations(username, cursor) : api.userPosts(username, cursor);
}

function profileRows(tab: Tab, locked: boolean, posts: Post[], lists: ReadingList[] | undefined): Row[] {
  if (locked) return [];
  if (tab === "lists") return (lists ?? []).map((list) => ({ kind: "list", id: list.id, list }));
  if (tab === "about") return [{ kind: "about", id: "about" }];
  return posts.map((post) => ({ kind: "post", id: post.id, post }));
}

function ListsEmpty({ query }: { query: UseQueryResult<ReadingList[]> }) {
  if (query.isPending && query.fetchStatus !== "idle") return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <EmptyState icon="library" title="No public lists" />;
}

function ProfileLoading({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <View className="gap-3 p-4">
      <Skeleton className="size-20 rounded-full" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
    </View>
  );
}

/** The current tab's queries and rows. Only the tab on screen fetches. */
function useProfileTab(username: string, profile: ProfileData, tab: Tab) {
  const api = useApi();
  const postTab = tab === "articles" || tab === "recommendations";
  const recommendations = tab === "recommendations";
  const posts = usePagedQuery(
    queryKeys.profilePosts(username, recommendations ? "recommendations" : "articles"),
    (cursor) => fetchProfilePosts(api, username, profile.remote, recommendations, cursor),
    { enabled: postTab && !profile.locked },
  );
  const lists = useQuery({
    queryKey: queryKeys.profileLists(username),
    queryFn: async () => (await api.userLists(username)).lists,
    enabled: tab === "lists" && !profile.locked,
  });
  return { posts, lists, postTab, rows: profileRows(tab, profile.locked, posts.items, lists.data) };
}

function ProfileListHeader({
  profile,
  isSelf,
  tab,
  onTabChange,
}: {
  profile: ProfileData;
  isSelf: boolean;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <View>
      <ProfileHeader profile={profile} isSelf={isSelf} />
      {profile.locked ? (
        <EmptyState icon="lock" title="This account is private" description="Follow it to see its posts." />
      ) : (
        <UnderlineTabs tabs={profile.remote ? REMOTE_TABS : LOCAL_TABS} value={tab} onChange={onTabChange} />
      )}
    </View>
  );
}

/** One list for the whole page, whatever the tab: the header stays mounted, so switching tabs never reloads it. */
function ProfileBody({
  username,
  profile,
  isSelf,
  scrollY,
  onRefreshProfile,
}: {
  username: string;
  profile: ProfileData;
  isSelf: boolean;
  scrollY: SharedValue<number>;
  onRefreshProfile: () => Promise<unknown>;
}) {
  const [tab, setTab] = useState<Tab>("articles");
  const scrollOffset = useTabBarScrollOffset(scrollY);
  const bottomInset = useTabBarInset();
  const { posts, lists, rows, postTab } = useProfileTab(username, profile, tab);
  const refresh = () => Promise.all([onRefreshProfile(), postTab ? posts.refetch() : lists.refetch()]);

  return (
    <ProfileUserContext value={profile.user}>
      <AnimatedLegendList
        data={rows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        getItemType={rowType}
        estimatedItemSize={300}
        recycleItems
        sharedValues={{ scrollOffset }}
        ListHeaderComponent={<ProfileListHeader profile={profile} isSelf={isSelf} tab={tab} onTabChange={setTab} />}
        ListEmptyComponent={
          profile.locked ? null : postTab ? (
            <PostListEmpty
              query={posts}
              empty={{ title: tab === "recommendations" ? "No recommendations yet" : "No articles yet" }}
            />
          ) : (
            <ListsEmpty query={lists} />
          )
        }
        ListFooterComponent={
          postTab && posts.items.length > 0 ? (
            <ListFooter
              loading={posts.isFetchingNextPage}
              error={posts.isFetchNextPageError ? posts.error : undefined}
              onRetry={() => void posts.fetchNextPage()}
            />
          ) : null
        }
        onEndReached={postTab ? posts.loadMore : undefined}
        onEndReachedThreshold={0.6}
        refreshControl={<PullToRefresh onRefresh={refresh} />}
        contentContainerStyle={{ paddingBottom: bottomInset }}
      />
    </ProfileUserContext>
  );
}

/** A profile page, local or remote: the web's `/@user` with its four tabs. */
export function ProfileView({ username, isTab = false }: { username: string; isTab?: boolean }) {
  const { user: viewer } = useViewer();
  const { data: profile, error, refetch } = useProfile(username);
  const isSelf = viewer?.username === username;
  const scrollY = useSharedValue(0);

  return (
    <Screen>
      <ScreenHeader
        back={!isTab}
        title={profile?.user.displayName ?? ""}
        // The big name sits beside the avatar; the header shows it once that has scrolled away.
        collapse={{ scrollY, after: 110 }}
        right={profile ? isSelf ? <AccountMenu /> : <ProfileMenu profile={profile} /> : undefined}
        className="border-b-0"
      />
      {profile ? (
        <ProfileBody
          username={username}
          profile={profile}
          isSelf={isSelf}
          scrollY={scrollY}
          onRefreshProfile={refetch}
        />
      ) : (
        <ProfileLoading error={error} onRetry={() => void refetch()} />
      )}
    </Screen>
  );
}
