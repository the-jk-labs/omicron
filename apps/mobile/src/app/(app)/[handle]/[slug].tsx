import type { Post } from "@omicron/contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Link, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState, type ComponentRef } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Comments } from "@/components/comments/comments";
import { useApi, useInstance } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { SaveToListButton } from "@/components/lists/save-to-list";
import { LikeButton, RecommendButton, CommentsButton, ShareButton } from "@/components/post/action-buttons";
import { AiAssistedBadge, TagList, UserAvatar } from "@/components/post/post-bits";
import { PostCard } from "@/components/post/post-card";
import { PostMenuButton } from "@/components/post/post-menu";
import { HtmlContent } from "@/components/reader/html-content";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { formatDate, readTime } from "@/lib/format";
import { profilePath, usernameFromHandle } from "@/lib/links";
import { findCachedPost } from "@/lib/query/cache";
import { queryKeys } from "@/lib/query/keys";

/** Title, byline, labels and banner: everything above the body. */
function ReaderHeader({ post }: { post: Post }) {
  const { media } = useInstance();
  const [bannerFailed, setBannerFailed] = useState(false);
  const banner = bannerFailed ? undefined : media(post.bannerUrl);
  const credit = post.coverCredit;
  return (
    <>
      {post.title && (
        <Text size="3xl" weight="bold" className="leading-tight" accessibilityRole="header">
          {post.title}
        </Text>
      )}

      <Link href={profilePath(post.author.username)} asChild>
        <PressableScale accessibilityRole="link" className="flex-row items-center gap-3">
          <UserAvatar name={post.author.displayName} url={post.author.avatarUrl} size={40} />
          <View className="flex-1">
            <Text weight="semibold" numberOfLines={1}>
              {post.author.displayName}
            </Text>
            <Text size="sm" tone="muted" numberOfLines={1}>
              {readTime(post.contentHtml)} min read · {formatDate(post.createdAt)}
            </Text>
          </View>
        </PressableScale>
      </Link>
      {(post.aiAssisted || post.remote) && (
        <View className="flex-row flex-wrap gap-2">
          {post.aiAssisted && <AiAssistedBadge />}
          {post.remote && (
            <View className="flex-row items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              <Icon name="globe" size={12} className="text-muted-foreground" />
              <Text size="xs" tone="muted">
                From {post.author.username.split("@")[1]}
              </Text>
            </View>
          )}
        </View>
      )}

      {banner && (
        <View className="gap-1.5">
          <Image
            source={banner}
            contentFit="cover"
            transition={180}
            onError={() => setBannerFailed(true)}
            style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 16 }}
          />
          {credit && (
            <Text size="xs" tone="muted">
              Photo by{" "}
              <Text
                size="xs"
                tone="muted"
                className="underline"
                onPress={() => void WebBrowser.openBrowserAsync(credit.nameUrl)}
              >
                {credit.name}
              </Text>{" "}
              on{" "}
              <Text
                size="xs"
                tone="muted"
                className="underline"
                onPress={() => void WebBrowser.openBrowserAsync(credit.sourceUrl)}
              >
                {credit.source}
              </Text>
            </Text>
          )}
        </View>
      )}
    </>
  );
}

export default function Reader() {
  // `focus=comments`: opened from a card's comment button, so it lands on the comments.
  const { handle, slug, focus } = useLocalSearchParams<{ handle: string; slug: string; focus?: string }>();
  const api = useApi();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
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
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const bodyRef = useRef<ComponentRef<typeof View>>(null);
  const commentsRef = useRef<ComponentRef<typeof View>>(null);
  const jumpToComments = useRef(focus === "comments");
  // Measured on demand: images and late blocks above keep moving the comments down after their first layout.
  const scrollToComments = (animated: boolean) => {
    if (!bodyRef.current) return;
    commentsRef.current?.measureLayout(bodyRef.current, (_x, y) => scrollRef.current?.scrollTo({ y, animated }));
  };

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
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="pb-24"
        onScrollBeginDrag={() => {
          jumpToComments.current = false;
        }}
        // Followed while the body above still grows, until the reader scrolls.
        onContentSizeChange={() => {
          if (jumpToComments.current) scrollToComments(false);
        }}
      >
        <View ref={bodyRef} className="gap-5 px-5 pt-2">
          <ReaderHeader post={post} />

          <HtmlContent html={post.contentHtml} />
          <TagList tags={post.tags} />

          <View ref={commentsRef} className="border-t border-border pt-6">
            <Comments postId={post.id} />
          </View>
        </View>

        {(related.data?.length ?? 0) > 0 && (
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
        <CommentsButton count={post.commentCount} onPress={() => scrollToComments(true)} />
        <RecommendButton post={post} />
        <View className="ml-auto flex-row items-center">
          <SaveToListButton post={post} fetch />
          <ShareButton post={post} />
        </View>
      </View>
    </Screen>
  );
}
