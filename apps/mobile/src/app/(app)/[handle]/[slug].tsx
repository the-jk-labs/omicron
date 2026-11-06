import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CommentsPreview } from "@/components/comments/comments";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { SaveToListButton } from "@/components/lists/save-to-list";
import { LikeButton, RecommendButton, CommentsButton, ShareButton } from "@/components/post/action-buttons";
import { TagList } from "@/components/post/post-bits";
import { PostCard } from "@/components/post/post-card";
import { PostMenuButton } from "@/components/post/post-menu";
import { HtmlContent } from "@/components/reader/html-content";
import { ReaderHeader } from "@/components/reader/reader-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { commentsPath, usernameFromHandle } from "@/lib/links";
import { findCachedPost } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

export default function Reader() {
  const { handle, slug } = useLocalSearchParams<{ handle: string; slug: string }>();
  const api = useApi();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [bodyShown, setBodyShown] = useState(false);
  const username = usernameFromHandle(handle);
  const {
    data: post,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.post(username, slug),
    queryFn: async () => (await api.postBySlug(username, slug)).post,
    // Opened from a card, the card's copy (body included) shows at once while the fresh one loads.
    placeholderData: () => findCachedPost(queryClient, username, slug),
  });
  const related = useQuery({
    queryKey: queryKeys.related(post?.id ?? ""),
    queryFn: async () => (await api.relatedPosts(post!.id)).items,
    enabled: Boolean(post),
  });

  if (!post) {
    return (
      <Screen>
        <ScreenHeader />
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <View className="gap-4 p-5">
            <Skeleton className="h-9 w-4/5" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="mt-4 h-48 w-full rounded-card" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </View>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader right={<PostMenuButton post={post} inReader />} className="border-b-0" />
      <ScrollView contentContainerClassName="pb-24">
        <View className="gap-5 px-5 pt-2">
          <ReaderHeader post={post} />

          <HtmlContent html={post.contentHtml} onComplete={() => setBodyShown(true)} />
          {/* After the body: nothing below it should hold up the screen opening. */}
          {bodyShown && (
            <>
              <TagList tags={post.tags} />

              <View className="border-t border-border pt-6">
                <CommentsPreview post={post} />
              </View>
            </>
          )}
        </View>

        {bodyShown && (related.data?.length ?? 0) > 0 && (
          <View className="mt-10 border-t border-border pt-6">
            <Text size="lg" weight="bold" className="px-5">
              Read next
            </Text>
            {related.data?.map((item) => (
              <PostCard key={item.id} post={item} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Actions stay in reach while reading, instead of only at the end of the article. */}
      <View
        className="absolute inset-x-0 bottom-0 flex-row items-center border-t border-border bg-background px-2"
        style={{ paddingBottom: insets.bottom }}
      >
        <LikeButton post={post} />
        <CommentsButton count={post.commentCount} onPress={() => router.push(commentsPath(post.id))} />
        <RecommendButton post={post} />
        <View className="ml-auto flex-row items-center">
          <SaveToListButton post={post} fetch />
          <ShareButton post={post} />
        </View>
      </View>
    </Screen>
  );
}
