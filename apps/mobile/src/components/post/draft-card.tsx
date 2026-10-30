import type { Post } from "@omicron/contract";
import { Image } from "expo-image";
import { router } from "expo-router";
import { memo, useState } from "react";
import { View } from "react-native";
import { withUniwind } from "uniwind";
import { useInstance } from "@/components/instance-provider";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { excerpt, formatScheduleLong, shortAgo } from "@/lib/format";

const StyledImage = withUniwind(Image);

/** An unpublished post, laid out like a PostCard: its state where the author sits, and no reactions yet. */
export const DraftCard = memo(function DraftCard({
  post,
  scheduled,
  onMenu,
}: {
  post: Post;
  scheduled: boolean;
  onMenu: (post: Post) => void;
}) {
  const { media } = useInstance();
  const [coverFailed, setCoverFailed] = useState(false);
  const banner = coverFailed ? undefined : media(post.bannerUrl);
  const summary = excerpt(post.contentHtml);
  const goesOut = scheduled && post.publishAt ? formatScheduleLong(post.publishAt) : null;

  return (
    <View className="border-b border-border px-4 py-5">
      <View className="mb-3 flex-row items-center gap-1.5">
        <View className="shrink flex-row items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
          <Icon name={goesOut ? "calendar-clock" : "file-pen-line"} size={13} className="text-muted-foreground" />
          <Text size="xs" weight="medium" tone="muted" numberOfLines={1}>
            {goesOut ? `Goes out ${goesOut}` : "Draft"}
          </Text>
        </View>
        {!goesOut && (
          <Text size="sm" tone="muted" numberOfLines={1} className="shrink-0">
            · edited {shortAgo(post.updatedAt ?? post.createdAt)}
          </Text>
        )}
        <View className="-my-3 -mr-3 ml-auto">
          <IconButton
            icon="ellipsis-vertical"
            label="Post options"
            size={18}
            iconClassName="text-muted-foreground"
            onPress={() => onMenu(post)}
          />
        </View>
      </View>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={post.title || "Untitled"}
        pressedScale={0.99}
        onPress={() => router.push({ pathname: "/compose", params: { id: post.id } })}
      >
        <View className="gap-1.5">
          <Text size="xl" weight="bold" tone={post.title ? "default" : "muted"} className="leading-snug">
            {post.title || "Untitled"}
          </Text>
          {summary ? (
            <Text tone="muted" numberOfLines={3} className="leading-normal">
              {summary}
            </Text>
          ) : null}
        </View>
        {banner && (
          <StyledImage
            source={banner}
            recyclingKey={banner}
            contentFit="cover"
            transition={150}
            onError={() => setCoverFailed(true)}
            className="mt-3 aspect-video w-full rounded-card border border-border"
          />
        )}
      </PressableScale>
    </View>
  );
});
