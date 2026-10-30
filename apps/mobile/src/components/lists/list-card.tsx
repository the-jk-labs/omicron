import type { ReadingList } from "@omicron/contract";
import { Link } from "expo-router";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { listPath } from "@/lib/links";

/** The web's ReadingListCard: a playlist-style tile with the list's size and visibility. */
export function ListCard({ list }: { list: ReadingList }) {
  return (
    <Link href={listPath(list)} asChild>
      <PressableScale
        accessibilityRole="link"
        pressedScale={0.99}
        className="flex-row items-center gap-4 rounded-card border border-border-card bg-background-alt p-4 shadow-card"
      >
        <View className="size-12 items-center justify-center rounded-card-sm bg-muted">
          <Icon name={list.isReadLater ? "clock" : "library"} size={22} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text weight="semibold" numberOfLines={1}>
            {list.title}
          </Text>
          <Text size="sm" tone="muted" numberOfLines={1}>
            {list.itemCount === 1 ? "1 story" : `${list.itemCount} stories`}
            {list.description ? ` · ${list.description}` : ""}
          </Text>
        </View>
        {list.visibility === "private" && <Icon name="lock" size={16} className="text-muted-foreground" />}
      </PressableScale>
    </Link>
  );
}
