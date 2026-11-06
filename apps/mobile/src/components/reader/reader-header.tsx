import type { Post } from "@omicron/contract";
import { Image } from "expo-image";
import { Link } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { View } from "react-native";
import { useInstance } from "@/components/instance-provider";
import { AiAssistedBadge, UserAvatar } from "@/components/post/post-bits";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { formatDate } from "@/lib/format";
import { postReadTime } from "@/lib/html/post-text";
import { profilePath } from "@/lib/links";

/** Title, byline, labels and banner: everything above the body. */
export function ReaderHeader({ post }: { post: Post }) {
  const { media } = useInstance();
  const [bannerFailed, setBannerFailed] = useState(false);
  // Not `bannerUrl`: its fallback is the body's first image, and the body is drawn right below.
  const banner = bannerFailed ? undefined : media(post.coverUrl);
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
              {postReadTime(post.contentHtml)} min read · {formatDate(post.createdAt)}
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
