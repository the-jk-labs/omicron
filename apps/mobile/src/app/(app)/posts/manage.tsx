import { LegendList } from "@legendapp/list/react-native";
import type { OwnPostStatus, Post } from "@omicron/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { DraftCard } from "@/components/post/draft-card";
import { PostList } from "@/components/post/post-list";
import { IconButton } from "@/components/ui/button";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { MenuSheet, useSheet, type MenuItem } from "@/components/ui/sheet";
import { EmptyState, ErrorState, ListFooter, LoadingState } from "@/components/ui/states";
import { UnderlineTabs } from "@/components/ui/tabs";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";

const isStatus = (value: unknown): value is OwnPostStatus =>
  value === "draft" || value === "scheduled" || value === "published";

type DraftTab = Exclude<OwnPostStatus, "published">;

/** The menu for one draft or scheduled post: open, publish, (re)schedule, unschedule, delete. */
function useDraftActions(tab: DraftTab, selected: Post | null): MenuItem[] {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
  const act = useMutation({
    mutationFn: async ({ post, action }: { post: Post; action: "publish" | "unschedule" | "delete" }) => {
      if (action === "delete") return api.deletePost(post.id);
      return api.updatePost(post.id, { status: action === "publish" ? "published" : "draft", publishAt: null });
    },
    onSuccess: (_result, { action }) => {
      toast({ publish: "Published", unschedule: "Moved to drafts", delete: "Deleted" }[action]);
      void refresh();
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return selected
    ? [
        {
          label: "Open in editor",
          icon: "pencil",
          onPress: () => router.push({ pathname: "/compose", params: { id: selected.id } }),
        },
        {
          label: "Publish now",
          icon: "send",
          onPress: async () => {
            if (await confirm({ title: "Publish this post now?", confirmText: "Publish" }))
              act.mutate({ post: selected, action: "publish" });
          },
        },
        {
          label: tab === "scheduled" ? "Reschedule" : "Schedule",
          icon: "calendar-clock",
          onPress: () => router.push({ pathname: "/compose", params: { id: selected.id } }),
        },
        {
          label: "Unschedule",
          icon: "calendar",
          hidden: tab !== "scheduled",
          onPress: () => act.mutate({ post: selected, action: "unschedule" }),
        },
        {
          label: "Delete",
          icon: "trash-2",
          destructive: true,
          onPress: async () => {
            if (
              await confirm({
                title: "Delete this post?",
                description: "This can't be undone.",
                confirmText: "Delete",
                destructive: true,
              })
            )
              act.mutate({ post: selected, action: "delete" });
          },
        },
      ]
    : [];
}

const EMPTY = {
  draft: { icon: "file-pen-line", title: "No drafts", description: "Stories you start and don't publish wait here." },
  scheduled: { icon: "calendar-clock", title: "Nothing scheduled", description: "Schedule a draft from the editor." },
} as const;

function DraftsEmpty({ tab, query }: { tab: DraftTab; query: ReturnType<typeof usePagedQuery<Post>> }) {
  if (query.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  return <EmptyState {...EMPTY[tab]} action={{ label: "Write a story", onPress: () => router.push("/compose") }} />;
}

/** Drafts or scheduled posts, each with the editor's actions in a menu. */
function DraftList({ tab }: { tab: DraftTab }) {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<Post | null>(null);
  const menu = useSheet();
  const query = usePagedQuery(queryKeys.ownPosts(tab), (cursor) => api.ownPosts(tab, cursor));

  const items = useDraftActions(tab, selected);

  return (
    <>
      <LegendList
        key={tab}
        data={query.items}
        keyExtractor={(post) => post.id}
        estimatedItemSize={200}
        recycleItems
        renderItem={({ item }) => (
          <DraftCard
            post={item}
            scheduled={tab === "scheduled"}
            onMenu={(post) => {
              setSelected(post);
              menu.present();
            }}
          />
        )}
        onEndReached={query.loadMore}
        ListEmptyComponent={<DraftsEmpty tab={tab} query={query} />}
        ListFooterComponent={
          query.items.length > 0 ? (
            <ListFooter
              loading={query.isFetchingNextPage}
              error={query.isFetchNextPageError ? query.error : undefined}
              onRetry={query.loadMore}
            />
          ) : null
        }
        refreshControl={<PullToRefresh onRefresh={query.refetch} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
      <MenuSheet sheetRef={menu.ref} title={selected?.title ?? "Untitled"} items={items} />
    </>
  );
}

/** "Your posts": drafts and scheduled as draft cards with their own actions; published as the feed's cards. */
export default function ManagePosts() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const api = useApi();
  const [tab, setTab] = useState<OwnPostStatus>(isStatus(params.tab) ? params.tab : "draft");
  const counts = useQuery({ queryKey: queryKeys.ownPostCounts, queryFn: api.ownPostCounts });
  const published = usePagedQuery(queryKeys.ownPosts("published"), (cursor) => api.ownPosts("published", cursor), {
    enabled: tab === "published",
  });

  return (
    <Screen>
      <ScreenHeader
        title="Your posts"
        right={
          <Link href="/compose" asChild>
            <IconButton icon="pen-line" label="Write a story" />
          </Link>
        }
      />
      <UnderlineTabs
        tabs={[
          { value: "draft", label: "Drafts", count: counts.data?.draft },
          { value: "scheduled", label: "Scheduled", count: counts.data?.scheduled },
          { value: "published", label: "Published", count: counts.data?.published },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "published" ? (
        <PostList
          query={published}
          empty={{ title: "Nothing published yet", description: "Your published stories show here." }}
        />
      ) : (
        <DraftList key={tab} tab={tab} />
      )}
    </Screen>
  );
}
