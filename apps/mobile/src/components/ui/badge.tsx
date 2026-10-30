import { View } from "react-native";
import { cn } from "tailwind-variants";
import { Text } from "./text";

export function Badge({ children, className }: { children: string; className?: string }) {
  return (
    <View className={cn("self-start rounded-5px bg-muted px-1.5 py-0.5", className)}>
      <Text size="xs" weight="medium" tone="alt">
        {children}
      </Text>
    </View>
  );
}

/** Unread count dot for tab icons and the bell. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View className="bg-destructive absolute -top-1 -right-1.5 min-w-4 items-center rounded-full px-1">
      <Text size="xxs" weight="bold" className="text-white">
        {count > 99 ? "99+" : String(count)}
      </Text>
    </View>
  );
}
