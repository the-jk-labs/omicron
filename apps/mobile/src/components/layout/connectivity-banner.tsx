import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInstance } from "@/components/instance-provider";
import { Icon, type IconName } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { confirmInstance } from "@/lib/network/connectivity";
import { useConnectivity } from "@/lib/network/use-device-network";

const BACK_ONLINE_MS = 2500;

type Status = "offline" | "down" | "back" | null;

const CONTENT: Record<Exclude<Status, null>, { icon: IconName; text: (name: string) => string }> = {
  offline: { icon: "wifi-off", text: () => "You're offline. Showing saved posts." },
  down: { icon: "server-off", text: (name) => `${name} isn't responding. Tap to retry.` },
  back: { icon: "wifi", text: () => "Back online" },
};

/** Offline, instance down, or for a moment "back online" after either. Never shown for the launch probe. */
function useBannerStatus(): Status {
  const { device, instance } = useConnectivity();
  const problem: Status = device === "offline" ? "offline" : instance === "down" ? "down" : null;
  const [hadProblem, setHadProblem] = useState(false);
  const [showBack, setShowBack] = useState(false);

  if (problem && !hadProblem) setHadProblem(true);
  if (!problem && hadProblem) {
    setHadProblem(false);
    setShowBack(true);
  }
  useEffect(() => {
    if (!showBack) return undefined;
    const timer = setTimeout(() => setShowBack(false), BACK_ONLINE_MS);
    return () => clearTimeout(timer);
  }, [showBack]);

  return problem ?? (showBack ? "back" : null);
}

/** A slim pill under the status bar while requests are paused. */
export function ConnectivityBanner() {
  const { name, origin } = useInstance();
  const insets = useSafeAreaInsets();
  const status = useBannerStatus();
  if (!status) return null;
  const content = CONTENT[status];

  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 items-center" style={{ top: insets.top + 6 }}>
      <Animated.View key={status} entering={FadeInUp.duration(200)} exiting={FadeOutUp.duration(160)}>
        <PressableScale
          accessibilityRole={status === "down" ? "button" : undefined}
          accessibilityLiveRegion="polite"
          disabled={status !== "down"}
          onPress={() => void confirmInstance(origin)}
          className="flex-row items-center gap-2 rounded-full bg-dark px-4 py-2 shadow-popover"
        >
          <Icon name={content.icon} size={14} className="text-background" />
          <Text size="xs" weight="semibold" tone="inverse">
            {content.text(name)}
          </Text>
        </PressableScale>
      </Animated.View>
    </View>
  );
}
