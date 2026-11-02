import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Fills the navigation bar's height below a bottom bar, and gives it up as the keyboard rises over it. */
export function BottomInset() {
  const insets = useSafeAreaInsets();
  const { progress } = useReanimatedKeyboardAnimation();
  const style = useAnimatedStyle(() => ({ height: insets.bottom * (1 - progress.get()) }));
  return <Animated.View style={style} className="bg-background" />;
}
