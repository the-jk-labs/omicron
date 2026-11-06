import { LegendList } from "@legendapp/list/react-native";
import type { Notification } from "@omicron/contract";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { memo, useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "tailwind-variants";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { UserAvatar } from "@/components/post/post-bits";
import { LikeHeart } from "@/components/ui/fillable-icon";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { EmptyState, ErrorState, ListFooter, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { timeAgo } from "@/lib/format";
import { profilePath } from "@/lib/links";
import { notificationAction, notificationHref, notificationIcon, notificationSubject } from "@/lib/notifications";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";

/** The avatar of whoever did it, with a small badge saying what they did, as on X. */
function NotificationAvatar({ item }: { item: Notification }) {
  const liked = item.type === "like" || item.type === "comment_like";
  const badge = (
    <View className="absolute -right-1 -bottom-1 size-6 items-center justify-center rounded-full border-2 border-background bg-background">
      {liked ? <LikeHeart size={14} liked /> : <Icon name={notificationIcon(item.type)} size={14} />}
    </View>
  );

  if (!item.actor) {
    return (
      <View className="size-11 items-center justify-center rounded-full bg-muted">
        <Icon name={notificationIcon(item.type)} size={18} className="text-foreground-alt" />
      </View>
    );
  }
  return (
    <Link href={profilePath(item.actor.username)} asChild>
      {/* self-start: a row's children stretch to its height, and the badge is pinned to this one's bottom. */}
      <PressableScale
        accessibilityRole="link"
        accessibilityLabel={item.actor.displayName}
        pressedScale={0.94}
        className="self-start"
      >
        <UserAvatar name={item.actor.displayName} url={item.actor.avatarUrl} size={44} />
        {badge}
      </PressableScale>
    </Link>
  );
}

const NotificationRow = memo(function NotificationRow({ item }: { item: Notification }) {
  const href = notificationHref(item);
  return (
    <PressableScale
      pressedScale={0.99}
      disabled={!href}
      accessibilityRole={href ? "button" : undefined}
      onPress={() => href && router.push(href)}
      className={cn("flex-row gap-3.5 border-b border-border px-4 py-4", !item.read && "bg-dark-04")}
    >
      <NotificationAvatar item={item} />
      <View className="flex-1 gap-1 pt-0.5">
        <View className="flex-row items-start gap-2">
          <Text size="sm" numberOfLines={2} className="flex-1 leading-5">
            <Text size="sm" weight="semibold">
              {notificationSubject(item)}
            </Text>{" "}
            <Text size="sm" tone="alt">
              {notificationAction(item.type)}
            </Text>
          </Text>
          <Text size="xs" tone="muted" className="leading-5">
            {timeAgo(item.createdAt)}
          </Text>
        </View>
        {item.postTitle ? (
          <Text size="sm" tone="muted" numberOfLines={1} className="leading-5">
            {item.postTitle}
          </Text>
        ) : null}
        {item.commentSnippet ? (
          <Text size="sm" numberOfLines={2} className="mt-1 leading-5">
            {item.commentSnippet}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
});

const renderNotification = ({ item }: { item: Notification }) => <NotificationRow item={item} />;
const keyOf = (item: Notification) => item.id;

export default function Notifications() {
  const api = useApi();
  const queryClient = useQueryClient();
  const bottomInset = useSafeAreaInsets().bottom + 24;
  const query = usePagedQuery(queryKeys.notifications, (cursor) => api.notifications(cursor));

  // Opening the page marks everything read, as on the web.
  useEffect(() => {
    void api.markAllNotificationsRead().then(() => queryClient.setQueryData(queryKeys.unreadCount, 0));
  }, [api, queryClient]);

  return (
    <Screen>
      <ScreenHeader title="Notifications" />
      <LegendList
        data={query.items}
        renderItem={renderNotification}
        keyExtractor={keyOf}
        estimatedItemSize={88}
        recycleItems
        onEndReached={query.loadMore}
        ListEmptyComponent={
          query.isPending ? (
            <LoadingState />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState
              icon="bell"
              title="No notifications yet"
              description="Likes, comments and new followers show up here."
            />
          )
        }
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
        contentContainerStyle={{ paddingBottom: bottomInset }}
      />
    </Screen>
  );
}
