import { LegendList } from "@legendapp/list/react-native";
import type { Notification } from "@omicron/contract";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { UserAvatar } from "@/components/post/post-bits";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { EmptyState, ErrorState, ListFooter, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { timeAgo } from "@/lib/format";
import { notificationAction, notificationHref, notificationIcon, notificationSubject } from "@/lib/notifications";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";

function NotificationRow({ item }: { item: Notification }) {
  const href = notificationHref(item);
  return (
    <PressableScale
      pressedScale={0.99}
      disabled={!href}
      onPress={() => href && router.push(href)}
      className={`flex-row gap-3 border-b border-border px-4 py-4 ${item.read ? "" : "bg-dark-04"}`}
    >
      <View className="w-8 items-center pt-1">
        <Icon
          name={notificationIcon(item.type)}
          size={18}
          className={item.type.includes("like") ? "text-destructive" : "text-foreground-alt"}
        />
      </View>
      <View className="flex-1 gap-2">
        {item.actor && <UserAvatar name={item.actor.displayName} url={item.actor.avatarUrl} size={32} />}
        <Text size="sm" className="leading-5">
          <Text size="sm" weight="semibold">
            {notificationSubject(item)}
          </Text>{" "}
          {notificationAction(item.type)}
          {item.postTitle ? (
            <Text size="sm" weight="medium">
              {" "}
              {item.postTitle}
            </Text>
          ) : null}
        </Text>
        {item.commentSnippet ? (
          <Text size="sm" tone="muted" numberOfLines={2}>
            {item.commentSnippet}
          </Text>
        ) : null}
        <Text size="xs" tone="muted">
          {timeAgo(item.createdAt)}
        </Text>
      </View>
    </PressableScale>
  );
}

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
        renderItem={({ item }) => <NotificationRow item={item} />}
        keyExtractor={(item) => item.id}
        estimatedItemSize={110}
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
