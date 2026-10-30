import { useEffect } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toasts } from "@/lib/dialogs/toast";
import { useStore } from "@/lib/store";
import { Icon } from "./icon";
import { Text } from "./text";

export function ToastHost() {
  const items = useStore(toasts);
  const insets = useSafeAreaInsets();
  useEffect(() => () => toasts.set([]), []);

  return (
    <View pointerEvents="box-none" className="absolute inset-x-4 gap-2" style={{ bottom: insets.bottom + 72 }}>
      {items.map((item) => (
        <Animated.View
          key={item.id}
          entering={FadeInDown.duration(180)}
          exiting={FadeOutDown.duration(160)}
          layout={LinearTransition.duration(180)}
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-2 self-center rounded-card-sm bg-dark px-4 py-3 shadow-popover"
        >
          {item.tone === "error" && <Icon name="triangle-alert" size={16} className="text-background" />}
          <Text size="sm" weight="medium" tone="inverse" className="shrink">
            {item.message}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}
