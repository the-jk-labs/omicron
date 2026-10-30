import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { ListFormSheet } from "@/components/lists/list-form";
import { PostList } from "@/components/post/post-list";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MenuSheet, useSheet } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { confirm } from "@/lib/dialogs/confirm";
import { profilePath } from "@/lib/links";
import { goBack } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";
import { usePagedQuery } from "@/lib/query/paged";

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const queryClient = useQueryClient();
  const menu = useSheet();
  const edit = useSheet();
  const detail = useQuery({ queryKey: queryKeys.list(id), queryFn: () => api.list(id) });
  const items = usePagedQuery(queryKeys.listItems(id), (cursor) => api.listItems(id, cursor));
  const remove = useMutation({
    mutationFn: () => api.deleteList(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
      goBack();
    },
  });

  const info = detail.data;
  return (
    <Screen>
      <ScreenHeader
        title={info?.list.title ?? ""}
        right={
          info?.isOwner && !info.list.isReadLater ? (
            <IconButton icon="ellipsis" label="List options" onPress={menu.present} />
          ) : undefined
        }
      />
      <PostList
        query={items}
        empty={{ title: "This list is empty", description: "Save stories here from any post." }}
        header={
          info ? (
            <View className="gap-2 border-b border-border px-4 py-5">
              <Text size="2xl" weight="bold">
                {info.list.title}
              </Text>
              {info.list.description ? <Text tone="muted">{info.list.description}</Text> : null}
              <View className="flex-row items-center gap-2">
                <Link href={profilePath(info.owner.username)}>
                  <Text size="sm" weight="medium">
                    {info.owner.displayName}
                  </Text>
                </Link>
                <Text size="sm" tone="muted">
                  · {info.list.itemCount} {info.list.itemCount === 1 ? "story" : "stories"}
                </Text>
                {info.list.visibility === "private" && <Icon name="lock" size={13} className="text-muted-foreground" />}
              </View>
            </View>
          ) : undefined
        }
      />
      {info && (
        <>
          <MenuSheet
            sheetRef={menu.ref}
            items={[
              { label: "Edit list", icon: "pencil", onPress: edit.present },
              {
                label: "Delete list",
                icon: "trash-2",
                destructive: true,
                onPress: async () => {
                  if (
                    await confirm({
                      title: "Delete this list?",
                      description: "The stories in it aren't affected.",
                      confirmText: "Delete",
                      destructive: true,
                    })
                  )
                    remove.mutate();
                },
              },
            ]}
          />
          <ListFormSheet sheetRef={edit.ref} list={info.list} />
        </>
      )}
    </Screen>
  );
}
