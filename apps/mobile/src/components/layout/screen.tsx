import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "tailwind-variants";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { goBack } from "@/lib/navigation";

/** A full-height page on the theme background, padded below the status bar. */
export function Screen({
  children,
  className,
  edges = "top",
}: {
  children: ReactNode;
  className?: string;
  edges?: "top" | "none";
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className={cn("flex-1 bg-background", className)} style={{ paddingTop: edges === "top" ? insets.top : 0 }}>
      {children}
    </View>
  );
}

/** Fades the header title in once the page has scrolled `after` points, where its own big title has gone. */
export type CollapsingTitle = { scrollY: SharedValue<number>; after: number };

/** Top bar: back button, title, and actions on the right. */
export function ScreenHeader({
  title,
  back = true,
  right,
  className,
  collapse,
}: {
  collapse?: CollapsingTitle;
  title?: string;
  back?: boolean;
  right?: ReactNode;
  className?: string;
}) {
  const titleStyle = useAnimatedStyle(() =>
    collapse
      ? {
          opacity: interpolate(
            collapse.scrollY.get(),
            [collapse.after, collapse.after + 32],
            [0, 1],
            Extrapolation.CLAMP,
          ),
        }
      : { opacity: 1 },
  );
  return (
    <View className={cn("h-14 flex-row items-center gap-1 border-b border-border px-2", className)}>
      {back ? (
        <IconButton icon="arrow-left" label="Back" onPress={goBack} iconClassName="text-foreground" />
      ) : (
        <View className="w-2" />
      )}
      <Animated.View className="flex-1" style={titleStyle}>
        <Text weight="semibold" size="lg" numberOfLines={1}>
          {title ?? ""}
        </Text>
      </Animated.View>
      {right && <View className="flex-row items-center">{right}</View>}
    </View>
  );
}
