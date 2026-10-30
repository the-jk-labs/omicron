import { Pressable } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withTiming } from "react-native-reanimated";
import { useThemeColors } from "@/hooks/use-theme-colors";

// The web's Switch: a 48×28 track, 22px thumb sliding 20px, foreground when on, dark-10 when off.
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const [on = "", off = ""] = useThemeColors(["--color-foreground", "--color-dark-10"]);
  const progress = useDerivedValue(() => withTiming(checked ? 1 : 0, { duration: 160 }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [off, on]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * 20 }] }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onCheckedChange(!checked)}
      className={disabled ? "opacity-50" : undefined}
    >
      <Animated.View className="h-7 w-12 justify-center rounded-full px-[3px]" style={trackStyle}>
        <Animated.View className="size-[22px] rounded-full bg-background" style={thumbStyle} />
      </Animated.View>
    </Pressable>
  );
}
