import { useState } from "react";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useInstance } from "@/components/instance-provider";
import { IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { needsAppUpdate } from "@/lib/api/version";
import { useInstanceInfo } from "@/lib/query/instance";

/** Asks for an app update when the instance runs a newer API than this build reads. Dismissed until next launch. */
export function UpdateBanner() {
  const { name } = useInstance();
  const { data: info } = useInstanceInfo();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !info || !needsAppUpdate(info.apiVersion)) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(200)}
      exiting={FadeOutUp.duration(160)}
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-3 rounded-card bg-dark py-2 pr-1 pl-4 shadow-popover"
    >
      <Icon name="circle-arrow-up" size={18} className="text-background" />
      <Text size="sm" weight="medium" tone="inverse" className="flex-1">
        {name} runs a newer Omicron. Update the app so everything loads.
      </Text>
      <IconButton
        icon="x"
        label="Dismiss"
        size={16}
        iconClassName="text-background"
        onPress={() => setDismissed(true)}
      />
    </Animated.View>
  );
}
