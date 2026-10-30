import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { createAnimatedComponent, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const AnimatedPressable = createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** How far the element shrinks while pressed; the web's `active:scale-[0.98]`. */
  pressedScale?: number;
};

/** Pressable with the web's press feedback, animated on the UI thread. */
export function PressableScale({ pressedScale = 0.98, onPressIn, onPressOut, style, ...props }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      onPressIn={(event) => {
        scale.set(withTiming(pressedScale, { duration: 90 }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, { duration: 140 }));
        onPressOut?.(event);
      }}
      style={[animatedStyle, style]}
      {...props}
    />
  );
}
