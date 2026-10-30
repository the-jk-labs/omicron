import * as Haptics from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/tabs";
import { createContext, use, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "tailwind-variants";
import { UserAvatar } from "@/components/post/post-bits";
import { CountBadge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";

export const TAB_BAR_HEIGHT = 60;

// Below this much travel a gesture is thumb jitter, not a change of direction.
const DIRECTION_THRESHOLD = 6;

const TabBarHiddenContext = createContext<SharedValue<number> | null>(null);

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  return <TabBarHiddenContext value={hidden}>{children}</TabBarHiddenContext>;
}

/**
 * Retracts the tab bar while `scrollOffset` moves down and brings it back on the way up, as the web does.
 * Returns the shared value to hand to a list (`sharedValues={{ scrollOffset }}`); pass `shared` when something
 * else on the screen also follows the scroll position.
 */
export function useTabBarScrollOffset(shared?: SharedValue<number>) {
  const hidden = use(TabBarHiddenContext);
  const own = useSharedValue(0);
  const scrollOffset = shared ?? own;
  const anchor = useSharedValue(0);
  useAnimatedReaction(
    () => scrollOffset.get(),
    (y) => {
      if (!hidden) return;
      const delta = y - anchor.get();
      if (y <= 0) hidden.set(withTiming(0, { duration: 180 }));
      else if (Math.abs(delta) > DIRECTION_THRESHOLD) hidden.set(withTiming(delta > 0 ? 1 : 0, { duration: 180 }));
      else return;
      anchor.set(y);
    },
  );
  return scrollOffset;
}

/** A tab opens its route; an action tab (Write, Sign in) runs `onPress` instead. `avatar` replaces the icon. */
export type TabSpec = {
  key: string;
  label: string;
  icon: IconName;
  badge?: number;
  onPress?: () => void;
  avatar?: { name: string; url: string | null | undefined };
};

export function TabBar({ state, emitter, navigateToTab, tabs }: BottomTabBarProps & { tabs: TabSpec[] }) {
  const insets = useSafeAreaInsets();
  const hidden = use(TabBarHiddenContext);
  const [height, setHeight] = useState(TAB_BAR_HEIGHT + insets.bottom);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (hidden?.get() ?? 0) * height }] }));
  const activeRoute = state.routes[state.index]?.name;

  const open = (route: string) => {
    const target = state.routes.find((r) => r.name === route);
    if (!target) return;
    const event = emitter.emit({ type: "tabPress", target: target.key, canPreventDefault: true });
    if (activeRoute !== route && !event.defaultPrevented) {
      void Haptics.selectionAsync();
      navigateToTab(target.key);
    }
    if (hidden) hidden.set(withTiming(0, { duration: 180 }));
  };

  return (
    <Animated.View
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      accessibilityRole="tablist"
      className="absolute inset-x-0 bottom-0 flex-row border-t border-border bg-background"
      style={[{ paddingBottom: insets.bottom }, style]}
    >
      {tabs.map((tab) => {
        const active = !tab.onPress && activeRoute === tab.key;
        return (
          <PressableScale
            key={tab.key}
            accessibilityRole={tab.onPress ? "button" : "tab"}
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            pressedScale={0.92}
            onPress={tab.onPress ?? (() => open(tab.key))}
            className="flex-1 items-center justify-center gap-1"
            style={{ height: TAB_BAR_HEIGHT }}
          >
            <View>
              {tab.avatar ? (
                // Taller than the icons, so it borrows the label gap rather than pushing its label down.
                // The ring is the avatar's own border, with padding as the gap, so both sides round alike.
                <View
                  className={cn(
                    "-my-1 rounded-full border-[1.5px] p-px",
                    active ? "border-foreground" : "border-transparent",
                  )}
                >
                  <UserAvatar name={tab.avatar.name} url={tab.avatar.url} size={25} bare />
                </View>
              ) : (
                <Icon name={tab.icon} size={22} className={active ? "text-foreground" : "text-muted-foreground"} />
              )}
              {tab.badge !== undefined && <CountBadge count={tab.badge} />}
            </View>
            <Text size="xxs" weight={active ? "semibold" : "medium"} tone={active ? "default" : "muted"}>
              {tab.label}
            </Text>
          </PressableScale>
        );
      })}
    </Animated.View>
  );
}

/** Space a scrolling screen leaves at its end so the last item clears the tab bar. */
export function useTabBarInset() {
  return TAB_BAR_HEIGHT + useSafeAreaInsets().bottom;
}
