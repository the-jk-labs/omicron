import * as Clipboard from "expo-clipboard";
import { Link, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { Linking, Share, View } from "react-native";
import { useInstance } from "@/components/instance-provider";
import { TagList, UserAvatar } from "@/components/post/post-bits";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { toast } from "@/lib/dialogs/toast";
import { compactCount, joinedLabel } from "@/lib/format";
import { hostOf } from "@/lib/instance/origin";
import { profilePath } from "@/lib/links";
import { linkSubtitle } from "@/lib/profile-links";
import type { ProfileData } from "@/lib/query/profile";
import { FollowButton } from "./follow-button";
import { LinkIcon } from "./link-icon";

const AVATAR_SIZE = 76;

function Count({ value, label, onPress }: { value: number; label: string; onPress?: () => void }) {
  return (
    <PressableScale accessibilityRole="button" disabled={!onPress} onPress={onPress} className="flex-row gap-1">
      <Text size="sm" weight="semibold">
        {compactCount(value)}
      </Text>
      <Text size="sm" tone="muted">
        {label}
      </Text>
    </PressableScale>
  );
}

function MetaItem({ icon, children, onPress }: { icon: ReactNode; children: string; onPress?: () => void }) {
  return (
    <PressableScale
      accessibilityRole={onPress ? "link" : "text"}
      disabled={!onPress}
      onPress={onPress}
      className="max-w-full flex-row items-center gap-1.5"
    >
      {icon}
      <Text size="sm" tone={onPress ? "alt" : "muted"} weight={onPress ? "medium" : "regular"} numberOfLines={1}>
        {children}
      </Text>
    </PressableScale>
  );
}

/** The top of a profile: avatar and actions, names, bio, details, counts and tags. */
export function ProfileHeader({ profile, isSelf }: { profile: ProfileData; isSelf: boolean }) {
  const { origin } = useInstance();
  const { user } = profile;
  // A local account's full fediverse address is user@this-instance.
  const handle = profile.remote ? `@${user.username}` : `@${user.username}@${hostOf(origin)}`;
  const profileUrl = profile.remote && "apId" in user ? user.apId : `${origin}${profilePath(user.username)}`;
  const openRelations = (kind: "followers" | "following") =>
    profile.locked
      ? undefined
      : () => router.push({ pathname: "/[handle]/relations", params: { handle: `@${user.username}`, kind } });

  return (
    <View>
      <View className="gap-3 px-4 pt-2 pb-4">
        <View className="flex-row items-center justify-between">
          <UserAvatar name={user.displayName} url={user.avatarUrl} size={AVATAR_SIZE} />
          <View className="flex-row items-center gap-2">
            <IconButton
              className="border-input size-9 border"
              size={16}
              iconClassName="text-foreground"
              icon="share-2"
              label="Share profile"
              onPress={() => void Share.share({ message: profileUrl, url: profileUrl })}
            />
            {isSelf ? (
              <Link href="/settings/profile" asChild>
                <Button variant="outline" shape="pill" size="sm">
                  Edit profile
                </Button>
              </Link>
            ) : (
              !profile.isBlocked && <FollowButton username={user.username} state={profile.followState} shape="pill" />
            )}
          </View>
        </View>

        <View>
          <View className="flex-row items-center gap-1.5">
            <Text size="2xl" weight="bold" numberOfLines={2} className="shrink">
              {user.displayName}
            </Text>
            {user.isPrivate && <Icon name="lock" size={16} className="text-muted-foreground" />}
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Copy ${handle}`}
            className="self-start"
            onPress={() => {
              void Clipboard.setStringAsync(handle);
              toast("Handle copied");
            }}
          >
            <Text tone="muted" numberOfLines={1}>
              {handle}
            </Text>
          </PressableScale>
        </View>

        {user.bio ? <Text className="leading-6">{user.bio}</Text> : null}

        <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
          {user.links?.map((link) => (
            <MetaItem
              key={`${link.platform}:${link.url}`}
              icon={<LinkIcon platform={link.platform} size={14} />}
              onPress={() =>
                void (/^https?:/.test(link.url) ? WebBrowser.openBrowserAsync(link.url) : Linking.openURL(link.url))
              }
            >
              {link.label || linkSubtitle(link.platform, link.url)}
            </MetaItem>
          ))}
          {"createdAt" in user && (
            <MetaItem icon={<Icon name="calendar" size={14} className="text-muted-foreground" />}>
              {joinedLabel(user.createdAt)}
            </MetaItem>
          )}
        </View>

        <View className="flex-row gap-4">
          <Count value={profile.counts.following} label="Following" onPress={openRelations("following")} />
          <Count value={profile.counts.followers} label="Followers" onPress={openRelations("followers")} />
        </View>

        <TagList tags={user.tags} />
      </View>
    </View>
  );
}
