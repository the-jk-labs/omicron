import { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { cn } from "tailwind-variants";

/** A pulsing placeholder block, the web's `animate-pulse bg-muted`. */
export function Skeleton({ className, ...props }: ViewProps) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View className={cn("rounded-button bg-muted", className)} style={style} {...props} />;
}

export function PostCardSkeleton() {
  return (
    <View className="gap-3 border-b border-border px-4 py-5">
      <View className="flex-row items-center gap-2">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </View>
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3.5 w-2/3" />
    </View>
  );
}
