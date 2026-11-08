import { View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  FadeOutDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { shouldDismissSwipe, useOtaUpdate } from "@/lib/updates/ota";

const SWIPED_AWAY = 140;

/** Says a downloaded update is ready. Dismissed, the update applies on the next launch by itself. */
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
    opacity: interpolate(offset.get(), [0, SWIPED_AWAY], [1, 0]),
  }));

  const swipe = usePanGesture({
    // Downward only, and a sideways drag is left alone so the screen below keeps it.
    activeOffsetY: 8,
    failOffsetX: [-24, 24],
    onUpdate: (event) => {
      "worklet";
      offset.set(Math.max(0, event.translationY));
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
    <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(160)}>
      <GestureDetector gesture={swipe}>
        <Animated.View
          style={animatedStyle}
          accessibilityLiveRegion="polite"
          className="flex-row items-center gap-3 rounded-card border border-border-card bg-background-alt py-2.5 pr-1.5 pl-3 shadow-popover"
        >
          <View className="size-9 items-center justify-center rounded-full bg-muted">
            <Icon name="sparkles" size={18} className="text-foreground" />
          </View>
          <View className="flex-1">
            <Text size="sm" weight="semibold">
              Update ready
            </Text>
            <Text size="xs" tone="muted">
              Restart to get the latest version.
            </Text>
          </View>
          <Button variant="solid" size="sm" shape="pill" loading={restarting} onPress={onRestart}>
            Restart
          </Button>
          <IconButton icon="x" label="Dismiss" size={16} className="size-8" onPress={onDismiss} />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
