import type { Post } from "@omicron/contract";
import { Image } from "expo-image";
import { Link, router } from "expo-router";
import { memo, useEffect, useState } from "react";
import { View } from "react-native";
import { withUniwind } from "uniwind";
import { useInstance } from "@/components/instance-provider";
import { SaveToListButton } from "@/components/lists/save-to-list";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { excerpt, formatDate, readTime, shortAgo } from "@/lib/format";
import { parseWhenIdle } from "@/lib/html/parse-cache";
import { postPath, profilePath } from "@/lib/links";
import { LikeButton, RecommendButton, CommentsButton, ShareButton } from "./action-buttons";
import { AiAssistedBadge, UserAvatar } from "./post-bits";
import { PostMenuButton } from "./post-menu";

const StyledImage = withUniwind(Image);
const SLOT = "flex-1 items-start";

/** A post card, laid out like the web's PostCard and the same on every screen. */
export const PostCard = memo(function PostCard({ post }: { post: Post }) {
  const { media } = useInstance();
  const [coverFailed, setCoverFailed] = useState(false);
  // An ingested post carries its own preview; anything written in the editor is clipped from the body.
  const summary = post.summary?.trim() || excerpt(post.contentHtml);
  const originInstance = post.remote ? post.author.username.split("@")[1] : undefined;
  const banner = coverFailed ? undefined : media(post.bannerUrl);
  const minutes = readTime(post.contentHtml);
  // Parsed ahead while idle, so tapping the card opens the full body at once.
  useEffect(() => parseWhenIdle(post.contentHtml), [post.contentHtml]);
  // The age follows the name as on X; the full date stays available to screen readers.
  const age = (
    <Text size="sm" tone="muted" numberOfLines={1} accessibilityLabel={formatDate(post.createdAt)} className="shrink-0">
      · {shortAgo(post.createdAt)}
    </Text>
  );

  return (
    <View className="border-border border-b px-4 py-5">
      {post.recommendedBy && (
        <Link href={profilePath(post.recommendedBy.username)} asChild>
          <PressableScale accessibilityRole="link" className="mb-2 flex-row items-center gap-1.5">
            <Icon name="repeat-2" size={14} className="text-muted-foreground" />
            <Text size="xs" weight="medium" tone="muted" numberOfLines={1} className="shrink">
              {post.recommendedBy.displayName} recommended this
            </Text>
          </PressableScale>
        </Link>
      )}

      <View className="mb-3 flex-row items-center gap-1.5">
        <Link href={profilePath(post.author.username)} asChild>
          <PressableScale
            accessibilityRole="link"
            accessibilityLabel={
              originInstance ? `${post.author.displayName}, from ${originInstance}` : post.author.displayName
            }
            className="shrink flex-row items-center gap-2"
          >
            <UserAvatar name={post.author.displayName} url={post.author.avatarUrl} size={24} />
            <Text size="sm" weight="semibold" numberOfLines={1} className="shrink">
              {post.author.displayName}
            </Text>
            {/* A remote author is marked, not named: the host left too little room for the name; their profile has it. */}
            {originInstance && <Icon name="globe" size={13} className="text-muted-foreground -ml-1" />}
          </PressableScale>
        </Link>
        {age}
        {/* Read time sits apart from the age at the far end, so "2d" and "3 min" never read as one figure. */}
        <View className="ml-auto shrink-0 flex-row items-center gap-2 pl-2">
          {post.aiAssisted && <AiAssistedBadge compact />}
          <Text size="sm" tone="muted" numberOfLines={1}>
            {minutes} min
          </Text>
          {/* Pulled into the card's padding so the dots line up with Share below rather than sitting inside it. */}
          <View className="-my-3 -mr-3">
            <PostMenuButton post={post} size={18} />
          </View>
        </View>
      </View>

      <Link href={postPath(post)} asChild>
        <PressableScale accessibilityRole="link" accessibilityLabel={post.title ?? undefined} pressedScale={0.99}>
          <View className="gap-1.5">
            {post.title && (
              <Text size="xl" weight="bold" className="leading-snug">
                {post.title}
              </Text>
            )}
            {summary ? (
              <Text tone="muted" numberOfLines={3} className="leading-normal">
                {summary}
              </Text>
            ) : null}
          </View>
          {/* Full width under the text: a phone has the width for it, and a thumbnail beside the title cramped both. */}
          {banner && (
            <StyledImage
              source={banner}
              recyclingKey={banner}
              contentFit="cover"
              transition={150}
              onError={() => setCoverFailed(true)}
              className="border-border mt-3 aspect-video w-full rounded-card border"
            />
          )}
        </PressableScale>
      </Link>

      {/* Icons start at equal steps: four equal slots, then Share at the end. Counts never move an icon. The inset
          draws the row in from the card's edges, so the icons sit closer together. */}
      <View className="mt-2 flex-row items-center px-4">
        <View className={SLOT}>
          <CommentsButton
            count={post.commentCount}
            onPress={() => router.push({ pathname: postPath(post), params: { focus: "comments" } })}
          />
        </View>
        <View className={SLOT}>
          <RecommendButton post={post} />
        </View>
        <View className={SLOT}>
          <LikeButton post={post} />
        </View>
        <View className={SLOT}>
          <SaveToListButton post={post} />
        </View>
        <ShareButton post={post} />
      </View>
    </View>
  );
});
