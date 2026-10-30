import type { Post, ReadingListForPost } from "@omicron/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { ToggleButton } from "@/components/post/action-buttons";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { inputClass, SheetInput } from "@/components/ui/input";
import { Sheet, useSheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useViewer } from "@/lib/auth/session";
import { errorMessage } from "@/lib/errors";
import { updatePostEverywhere } from "@/lib/query/cache";
import { useRequireSignIn } from "@/lib/query/engagement";
import { queryKeys } from "@/lib/query/keys";
import { createStore, useStore } from "@/lib/store";

// One sheet for the whole app: a sheet per feed card would mount hundreds of them.
const target = createStore<string | null>(null);

/** Lists holding the post, as the save sheet loads them. A feed card only reads what is already cached. */
function useListsForPost(postId: string, enabled: boolean) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.listsForPost(postId),
    queryFn: async () => {
      const { lists } = await api.listsForPost(postId);
      const saved = lists.some((list) => list.contains);
      updatePostEverywhere(queryClient, postId, (post) => (post.saved === saved ? post : { ...post, saved }));
      return lists;
    },
    enabled,
    meta: { persist: false },
  });
}

/** Bookmark that fills once the post is saved to a list. Instances older than `Post.saved` fall back to loading
 * the post's lists, in the reader only (`fetch`). */
export function SaveToListButton({ post, fetch = false }: { post: Post; fetch?: boolean }) {
  const requireSignIn = useRequireSignIn();
  const { signedIn } = useViewer();
  const { data: lists } = useListsForPost(post.id, fetch && signedIn && post.saved === undefined);
  const saved = post.saved ?? Boolean(lists?.some((list) => list.contains));
  return (
    <ToggleButton
      icon="bookmark"
      tone="saved"
      active={saved}
      label={saved ? "Saved to a list" : "Save to list"}
      onPress={() => requireSignIn(() => target.set(post.id))}
    />
  );
}

/** The web's SaveToListButton popover: the user's lists (Read later first), each toggled for this post. */
export function SaveToListHost() {
  const postId = useStore(target);
  const { ref } = useSheet();
  useEffect(() => {
    if (postId) ref.current?.present();
  }, [postId, ref]);

  return (
    <Sheet sheetRef={ref} title="Save to list" onDismiss={() => target.set(null)}>
      {postId && <SaveToListBody postId={postId} />}
    </Sheet>
  );
}

function SaveToListBody({ postId }: { postId: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = queryKeys.listsForPost(postId);
  const { data: lists, error, isPending } = useListsForPost(postId, true);
  const [newTitle, setNewTitle] = useState("");

  const setContains = (id: string, contains: boolean) => {
    const next = queryClient.setQueryData<ReadingListForPost[]>(key, (current) =>
      current?.map((list) =>
        list.id === id ? { ...list, contains, itemCount: list.itemCount + (contains ? 1 : -1) } : list,
      ),
    );
    // Every card showing the post fills or empties its bookmark with it.
    const saved = Boolean(next?.some((list) => list.contains));
    updatePostEverywhere(queryClient, postId, (post) => (post.saved === saved ? post : { ...post, saved }));
  };

  const toggle = useMutation({
    mutationFn: (list: ReadingListForPost) =>
      list.contains ? api.removeFromList(list.id, postId) : api.addToList(list.id, postId),
    onMutate: (list) => setContains(list.id, !list.contains),
    onError: (_error, list) => setContains(list.id, list.contains),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
  });

  const create = useMutation({
    mutationFn: async (title: string) => {
      const { list } = await api.createList({ title });
      // Shown as soon as it exists, so a failed add can't hide it (and a retry can't make a twin).
      queryClient.setQueryData<ReadingListForPost[]>(key, (current) => [
        ...(current ?? []),
        { ...list, contains: false },
      ]);
      await api.addToList(list.id, postId);
      setContains(list.id, true);
    },
    onSuccess: () => {
      setNewTitle("");
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists });
    },
  });

  if (isPending) {
    return (
      <View className="py-8">
        <Spinner />
      </View>
    );
  }

  const failure = error ?? toggle.error ?? create.error;
  return (
    <View className="gap-1 px-2">
      {lists?.map((list) => (
        <Pressable
          key={list.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: list.contains }}
          onPress={() => toggle.mutate(list)}
          className="active:bg-muted h-12 flex-row items-center gap-3 rounded-9px px-3"
        >
          <Icon
            name={list.contains ? "bookmark-check" : "bookmark"}
            size={18}
            className={list.contains ? "text-foreground" : "text-muted-foreground"}
          />
          <Text weight="medium" numberOfLines={1} className="flex-1">
            {list.title}
          </Text>
          {list.visibility === "private" && <Icon name="lock" size={14} className="text-muted-foreground" />}
        </Pressable>
      ))}
      <View className="flex-row items-center gap-2 px-1 pt-2">
        <SheetInput
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="New list"
          returnKeyType="done"
          onSubmitEditing={() => newTitle.trim() && create.mutate(newTitle.trim())}
          placeholderTextColorClassName="accent-muted-foreground"
          className={`flex-1 ${inputClass}`}
        />
        <Button
          variant="outline"
          icon="plus"
          loading={create.isPending}
          disabled={!newTitle.trim()}
          onPress={() => create.mutate(newTitle.trim())}
        >
          Create
        </Button>
      </View>
      {failure ? (
        <Text size="sm" tone="destructive" className="px-2 pt-1">
          {errorMessage(failure)}
        </Text>
      ) : null}
    </View>
  );
}
