import { AnimatedLegendList } from "@legendapp/list/reanimated";
import type { Post } from "@omicron/contract";
import type { ReactElement } from "react";
import { View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { useTabBarInset, useTabBarScrollOffset } from "@/components/layout/tab-bar";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { PostCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, ListFooter, OfflineState } from "@/components/ui/states";
import { useIsOffline } from "@/lib/network/use-device-network";
import { emptyPhase } from "@/lib/query/list-state";
import type { usePagedQuery } from "@/lib/query/paged";
import { PostCard } from "./post-card";

type PagedPosts = Pick<
  ReturnType<typeof usePagedQuery<Post>>,
  | "items"
  | "isPending"
  | "fetchStatus"
  | "error"
  | "isRefetching"
  | "refetch"
  | "loadMore"
  | "isFetchingNextPage"
  | "isFetchNextPageError"
  | "fetchNextPage"
>;

const renderPost = ({ item }: { item: Post }) => <PostCard post={item} />;
const keyOf = (post: Post) => post.id;

/** What a post list shows before it has rows: skeletons, offline, an error or its empty message. */
export function PostListEmpty({
  query,
  empty,
}: {
  query: PagedPosts;
  empty?: { title: string; description?: string };
}) {
  const offline = useIsOffline();
  switch (emptyPhase(query, offline)) {
    case "offline":
      return <OfflineState />;
    case "loading":
      return (
        <View>
          <PostCardSkeleton />
          <PostCardSkeleton />
          <PostCardSkeleton />
        </View>
      );
    case "error":
      return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
    default:
      return (
        <EmptyState icon="file-text" title={empty?.title ?? "Nothing here yet"} description={empty?.description} />
      );
  }
}

/** A recycled, paged list of post cards with pull-to-refresh, used by every timeline in the app. */
export function PostList({
  query,
  header,
  empty,
  scrollY,
}: {
  /** Mirrors the list's scroll position, for a header that reacts to it. */
  scrollY?: SharedValue<number>;
  query: PagedPosts;
  header?: ReactElement;
  empty?: { title: string; description?: string };
}) {
  const scrollOffset = useTabBarScrollOffset(scrollY);
  const bottomInset = useTabBarInset();

  return (
    <AnimatedLegendList
      data={query.items}
      renderItem={renderPost}
      keyExtractor={keyOf}
      estimatedItemSize={360}
      recycleItems
      sharedValues={{ scrollOffset }}
      ListHeaderComponent={header}
      ListEmptyComponent={<PostListEmpty query={query} empty={empty} />}
      ListFooterComponent={
        query.items.length > 0 ? (
          <ListFooter
            loading={query.isFetchingNextPage}
            error={query.isFetchNextPageError ? query.error : undefined}
            onRetry={() => void query.fetchNextPage()}
          />
        ) : null
      }
      onEndReached={query.loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={
        // A cached list refreshing in the background (at launch) shows it, so new posts don't jump in unannounced.
        <PullToRefresh onRefresh={query.refetch} syncing={query.isRefetching && query.items.length > 0} />
      }
      contentContainerStyle={{ paddingBottom: bottomInset }}
    />
  );
}
