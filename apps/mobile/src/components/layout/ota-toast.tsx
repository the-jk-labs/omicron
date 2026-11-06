import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  FadeInUp,
  FadeOutUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Icon } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { shouldDismissSwipe, useOtaUpdate } from "@/lib/updates/ota";

const SWIPED_AWAY = -140;

/** Says a downloaded update is ready. Swipe it up to wait: the update then applies on the next launch by itself. */
export function OtaToast() {
  const { visible, restarting, restart, dismiss } = useOtaUpdate();
  // Mounted only while shown, so an update after a dismissed one starts back in place rather than swiped away.
  return visible ? <Card restarting={restarting} onRestart={restart} onDismiss={dismiss} /> : null;
}

function Card({
  restarting,
  onRestart,
  onDismiss,
}: {
  restarting: boolean;
  onRestart: () => void;
  onDismiss: () => void;
}) {
  const offset = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
    opacity: interpolate(offset.get(), [SWIPED_AWAY, 0], [0, 1]),
  }));

  const swipe = usePanGesture({
    // Upward only, and a sideways drag is left alone so the screen below keeps it.
    activeOffsetY: -8,
    failOffsetX: [-24, 24],
    onUpdate: (event) => {
      "worklet";
      offset.set(Math.min(0, event.translationY));
    },
    onDeactivate: (event) => {
      "worklet";
      if (shouldDismissSwipe(event.translationY, event.velocityY)) {
        offset.set(
          withTiming(SWIPED_AWAY, { duration: 160 }, (finished) => {
            if (finished) scheduleOnRN(onDismiss);
          }),
        );
      } else {
        offset.set(withSpring(0));
      }
    },
  });

  return (
    <Animated.View entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(160)}>
      <GestureDetector gesture={swipe}>
        <Animated.View
          style={animatedStyle}
          accessibilityLiveRegion="polite"
          // A screen reader can't swipe, so dismissing is offered as an action too.
          accessibilityActions={[{ name: "dismiss", label: "Dismiss" }]}
          onAccessibilityAction={onDismiss}
          className="rounded-card bg-dark py-2 pr-2 pl-4 shadow-popover"
        >
          <View className="flex-row items-center gap-3">
            <Icon name="sparkles" size={18} className="text-background" />
            <View className="flex-1">
              <Text size="sm" weight="semibold" tone="inverse">
                Update ready
              </Text>
              <Text size="xs" tone="inverse" className="opacity-80">
                Restart to get the latest version.
              </Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              disabled={restarting}
              onPress={onRestart}
              className="rounded-input bg-background px-3 py-2"
            >
              <Text size="sm" weight="semibold">
                {restarting ? "Restarting…" : "Restart"}
              </Text>
            </PressableScale>
          </View>
          {/* The grabber says it can be swiped away, as there's no close button. */}
          <View className="mt-1.5 mr-2 h-1 w-8 self-center rounded-full bg-background/30" />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
