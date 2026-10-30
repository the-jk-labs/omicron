import { LegendList } from "@legendapp/list/react-native";
import type { Report } from "@omicron/contract";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApi, useInstance } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { UserAvatar } from "@/components/post/post-bits";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { EmptyState, ErrorState, ListFooter, LoadingState } from "@/components/ui/states";
import { ChipTabs, UnderlineTabs } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useDebounced } from "@/hooks/use-debounced";
import { useViewer } from "@/lib/auth/session";
import { confirmDialog } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { profilePath } from "@/lib/links";
import { queryKeys } from "@/lib/query/keys";

type Section = "reports" | "users";

/** Open reports, from the open list's own answer: the section tab and the filter chip share it. */
function useOpenReportCount() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.adminReports("open"),
    queryFn: () => api.adminReports("open"),
    select: (data) => data.openCount,
  }).data;
}
type UserFilter = "all" | "suspended" | "admin" | "unverified";

function ReportCard({ report }: { report: Report }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("admin") });
  const act = useMutation({
    mutationFn: async (action: "resolve" | "remove-post" | "suspend") => {
      if (action === "remove-post" && report.postId) {
        const { confirmed, notify } = await confirmDialog({
          title: "Remove this post?",
          confirmText: "Remove",
          destructive: true,
          notify: "Notify the author",
        });
        if (!confirmed) return false;
        await api.adminRemovePost(report.postId, notify);
      }
      if (action === "suspend" && report.userId) {
        const { confirmed, notify } = await confirmDialog({
          title: `Suspend @${report.userUsername}?`,
          description: "They can't sign in or post until unsuspended.",
          confirmText: "Suspend",
          destructive: true,
          notify: "Tell them by email",
        });
        if (!confirmed) return false;
        await api.suspendUser(report.userId, true, notify);
      }
      await api.resolveReport(report.id, action === "resolve" ? "dismissed" : action);
      return true;
    },
    onSuccess: (done) => {
      if (!done) return;
      toast("Report resolved");
      void refresh();
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  const open = report.status === "open";
  return (
    <Card className="gap-3 p-0">
      <View className="flex-row items-center gap-3 px-4 pt-4">
        <View className="bg-muted size-9 items-center justify-center rounded-full">
          <Icon name={report.subjectType === "post" ? "file-text" : "user"} size={16} />
        </View>
        <View className="flex-1">
          <Text size="sm" weight="semibold">
            {report.subjectType === "post" ? "Reported post" : "Reported account"}
          </Text>
          <Text size="xs" tone="muted" numberOfLines={1}>
            by {report.reporter ? `@${report.reporter.username}` : "a deleted account"} · {timeAgo(report.createdAt)}
          </Text>
        </View>
        {!open && <Badge>{report.resolution ? `Resolved: ${report.resolution}` : "Resolved"}</Badge>}
      </View>

      {/* The reported post or account, as a row that opens it. */}
      <PressableScale
        pressedScale={0.99}
        onPress={() => {
          if (report.subjectType !== "post") router.push(profilePath(report.userUsername ?? ""));
          else if (report.postId) router.push({ pathname: "/posts/[id]", params: { id: report.postId } });
        }}
        className="border-border bg-background mx-4 flex-row items-center gap-3 rounded-input border px-3 py-2.5"
      >
        <View className="flex-1">
          <Text weight="medium" numberOfLines={2}>
            {report.subjectType === "post" ? report.postTitle || "Untitled post" : report.userDisplayName}
          </Text>
          <Text size="xs" tone="muted" numberOfLines={1}>
            {report.subjectType === "post"
              ? report.postAuthor
                ? `by @${report.postAuthor}`
                : "Post"
              : `@${report.userUsername}`}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} className="text-muted-foreground" />
      </PressableScale>

      {report.reason ? (
        <View className="border-border mx-4 border-l-2 pl-3">
          <Text size="sm" className="font-content-italic">
            {report.reason}
          </Text>
        </View>
      ) : null}

      {open ? (
        <View className="border-border flex-row gap-2 border-t p-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={act.isPending}
            onPress={() => act.mutate("resolve")}
          >
            Dismiss
          </Button>
          {report.postId && (
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={act.isPending}
              onPress={() => act.mutate("remove-post")}
            >
              Remove post
            </Button>
          )}
          {report.userId && (
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={act.isPending}
              onPress={() => act.mutate("suspend")}
            >
              Suspend
            </Button>
          )}
        </View>
      ) : (
        <View className="pb-1" />
      )}
    </Card>
  );
}

function Reports() {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const query = useQuery({ queryKey: queryKeys.adminReports(status), queryFn: () => api.adminReports(status) });
  const openCount = useOpenReportCount();
  return (
    <LegendList
      key={status}
      data={query.data?.reports ?? []}
      keyExtractor={(report) => report.id}
      estimatedItemSize={180}
      renderItem={({ item }) => (
        <View className="px-4 pb-3">
          <ReportCard report={item} />
        </View>
      )}
      ListHeaderComponent={
        <ChipTabs
          tabs={[
            { value: "open", label: "Open", count: openCount },
            { value: "resolved", label: "Resolved" },
          ]}
          value={status}
          onChange={setStatus}
          className="py-3"
        />
      }
      ListEmptyComponent={
        query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState icon="flag" title={status === "open" ? "No open reports" : "No resolved reports"} />
        )
      }
      refreshControl={<PullToRefresh onRefresh={query.refetch} />}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    />
  );
}

function Users() {
  const api = useApi();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const q = useDebounced(text.trim());
  const filters =
    filter === "suspended"
      ? { suspended: true }
      : filter === "admin"
        ? { admin: true }
        : filter === "unverified"
          ? { verified: false }
          : {};
  const query = useInfiniteQuery({
    queryKey: queryKeys.adminUsers(q, filter),
    queryFn: ({ pageParam }) => api.adminUsers(q, filters, { cursor: pageParam, limit: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    meta: { persist: false },
  });
  const users = useMemo(() => query.data?.pages.flatMap((page) => page.users) ?? [], [query.data]);

  return (
    <LegendList
      data={users}
      keyExtractor={(user) => user.id}
      estimatedItemSize={64}
      recycleItems
      renderItem={({ item }) => (
        <PressableScale
          pressedScale={0.99}
          onPress={() => router.push({ pathname: "/admin/users/[id]", params: { id: item.id } })}
          className="border-border flex-row items-center gap-3 border-b px-4 py-3"
        >
          <UserAvatar name={item.displayName} url={item.avatarUrl} size={36} />
          <View className="flex-1">
            <Text weight="semibold" numberOfLines={1}>
              {item.displayName}
            </Text>
            <Text size="xs" tone="muted" numberOfLines={1}>
              @{item.username} · {item.email}
            </Text>
          </View>
          {item.suspended ? (
            <Badge>Suspended</Badge>
          ) : item.isAdmin ? (
            <Badge>Admin</Badge>
          ) : item.isModerator ? (
            <Badge>Moderator</Badge>
          ) : null}
          <Icon name="chevron-right" size={16} className="text-muted-foreground" />
        </PressableScale>
      )}
      ListHeaderComponent={
        <View className="border-border gap-3 border-b py-3">
          <View className="justify-center px-4">
            <Input
              value={text}
              onChangeText={setText}
              placeholder="Search by name, username or email"
              autoCapitalize="none"
              returnKeyType="search"
              className="h-10 pl-9"
            />
            <View className="absolute left-7" pointerEvents="none">
              <Icon name="search" size={16} className="text-muted-foreground" />
            </View>
          </View>
          <ChipTabs
            tabs={[
              { value: "all", label: "All" },
              { value: "suspended", label: "Suspended" },
              { value: "admin", label: "Admins" },
              { value: "unverified", label: "Unverified" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          {query.data && (
            <Text size="xs" tone="muted" className="px-4">
              {query.data.pages[0]?.filteredTotal ?? 0} of {query.data.pages[0]?.total ?? 0} accounts
            </Text>
          )}
        </View>
      }
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && void query.fetchNextPage()}
      ListEmptyComponent={
        query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState icon="users" title="No accounts match" />
        )
      }
      ListFooterComponent={users.length ? <ListFooter loading={query.isFetchingNextPage} /> : null}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    />
  );
}

/** Moderation: reports and accounts. The rest of /admin (instance, email, security…) opens on the web. */
export default function Admin() {
  const { origin } = useInstance();
  const { user } = useViewer();
  const [section, setSection] = useState<Section>("reports");
  const openCount = useOpenReportCount();
  if (!user?.isAdmin && !user?.isModerator) return null;

  return (
    <Screen>
      <ScreenHeader
        title={user.isAdmin ? "Admin" : "Moderation"}
        right={
          user.isAdmin ? (
            <IconButton
              icon="external-link"
              label="Instance settings on the web"
              onPress={() => void WebBrowser.openBrowserAsync(`${origin}/admin`)}
            />
          ) : undefined
        }
      />
      <UnderlineTabs
        tabs={[
          { value: "reports", label: "Reports", count: openCount || undefined },
          { value: "users", label: "Users" },
        ]}
        value={section}
        onChange={setSection}
      />
      {section === "reports" ? <Reports /> : <Users />}
    </Screen>
  );
}
