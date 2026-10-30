import type { Tag } from "@omicron/contract";
import { Link } from "expo-router";
import { View } from "react-native";
import { useInstance } from "@/components/instance-provider";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { toast } from "@/lib/dialogs/toast";
import { tagPath } from "@/lib/links";

/** An avatar whose URL comes from the API (resolved and proxied through the instance). */
export function UserAvatar({
  name,
  url,
  size,
  bare,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
  bare?: boolean;
}) {
  const { media } = useInstance();
  return <Avatar name={name} src={media(url)} size={size} bare={bare} />;
}

/** The web's TagList: muted pills linking to each tag. */
export function TagList({ tags, className }: { tags: readonly Tag[]; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <View className={`flex-row flex-wrap gap-2 ${className ?? ""}`}>
      {tags.map((tag) => (
        <Link key={tag.slug} href={tagPath(tag.slug)} asChild>
          <PressableScale accessibilityRole="link" className="rounded-full bg-muted px-3 py-1">
            <Text size="xs" weight="medium" tone="alt">
              #{tag.name}
            </Text>
          </PressableScale>
        </Link>
      ))}
    </View>
  );
}

/** The web's AiAssistedBadge; tapping explains it, as the web's popover does. */
/** `compact` shortens the label to "AI" so a card's meta row stays on one line. */
export function AiAssistedBadge({ compact = false }: { compact?: boolean }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="AI-Assisted post information"
      onPress={() => toast("This post was written with AI assistance.")}
      className="flex-row items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5"
    >
      <Icon name="sparkles" size={12} />
      <Text size="xs" weight="medium">
        {compact ? "AI" : "AI-Assisted"}
      </Text>
    </PressableScale>
  );
}
