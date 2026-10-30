import type { RelationActor } from "@omicron/contract";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { UserAvatar } from "@/components/post/post-bits";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { profilePath } from "@/lib/links";

/** One account in a people list (followers, search, suggestions), with an optional action on the right. */
export function ActorRow({ actor, action, subtitle }: { actor: RelationActor; action?: ReactNode; subtitle?: string }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <Link href={profilePath(actor.username)} asChild>
        <PressableScale accessibilityRole="link" pressedScale={0.99} className="flex-1 flex-row items-center gap-3">
          <UserAvatar name={actor.displayName} url={actor.avatarUrl} size={40} />
          <View className="flex-1">
            <Text weight="semibold" numberOfLines={1}>
              {actor.displayName}
            </Text>
            <Text size="sm" tone="muted" numberOfLines={1}>
              {subtitle ?? `@${actor.username}`}
            </Text>
          </View>
        </PressableScale>
      </Link>
      {action}
    </View>
  );
}
