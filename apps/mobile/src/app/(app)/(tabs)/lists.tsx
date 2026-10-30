import { useQuery } from "@tanstack/react-query";
import { ScrollView, View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { useTabBarInset } from "@/components/layout/tab-bar";
import { ListCard } from "@/components/lists/list-card";
import { ListFormSheet } from "@/components/lists/list-form";
import { IconButton } from "@/components/ui/button";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { useSheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { queryKeys } from "@/lib/query/keys";

export default function Lists() {
  const api = useApi();
  const bottomInset = useTabBarInset();
  const create = useSheet();
  const query = useQuery({ queryKey: queryKeys.lists, queryFn: async () => (await api.myLists()).lists });
  // "Read later" is pinned first, as on the web.
  const lists = [...(query.data ?? [])].sort((a, b) => Number(b.isReadLater) - Number(a.isReadLater));

  return (
    <Screen>
      <ScreenHeader
        back={false}
        title="Your lists"
        right={<IconButton icon="plus" label="New list" onPress={create.present} />}
      />
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
        refreshControl={<PullToRefresh onRefresh={query.refetch} />}
      >
        {query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : lists.length === 0 ? (
          <EmptyState
            icon="library"
            title="No lists yet"
            action={{ label: "Create a list", onPress: create.present }}
          />
        ) : (
          <View className="gap-3">
            {lists.map((list) => (
              <ListCard key={list.id} list={list} />
            ))}
          </View>
        )}
      </ScrollView>
      <ListFormSheet sheetRef={create.ref} />
    </Screen>
  );
}
