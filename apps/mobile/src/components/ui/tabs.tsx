import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { cn } from "tailwind-variants";
import { Icon, type IconName } from "./icon";
import { Text } from "./text";

export type TabItem<T extends string> = { value: T; label: string; icon?: IconName; count?: number };

type TabsProps<T extends string> = {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

type Layout = { x: number; width: number };

const TIMING = { duration: 220 };

/** A tab's count as a small pill beside its label, so "Drafts 6" never reads as one word. */
function TabCount({ count, selected }: { count: number; selected: boolean }) {
  return (
    <View className={cn("min-w-5 items-center rounded-full px-1.5 py-px", selected ? "bg-foreground" : "bg-muted")}>
      <Text size="xxs" weight="semibold" className={selected ? "text-background" : "text-muted-foreground"}>
        {count > 999 ? "999+" : String(count)}
      </Text>
    </View>
  );
}

/** Measures each tab so the active marker can slide to it on the UI thread. `inset` shortens it to the middle. */
function useActiveLayout(value: string, inset = 0) {
  const [layouts, setLayouts] = useState<Record<string, Layout>>({});
  const onLayout = (key: string) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) =>
      current[key]?.x === x && current[key]?.width === width ? current : { ...current, [key]: { x, width } },
    );
  };
  const active = layouts[value];
  const markerStyle = useAnimatedStyle(() =>
    active
      ? {
          opacity: 1,
          width: withTiming(active.width * (1 - 2 * inset), TIMING),
          transform: [{ translateX: withTiming(active.x + active.width * inset, TIMING) }],
        }
      : { opacity: 0 },
  );
  return { onLayout, markerStyle };
}

/** Pill tabs, the web's PageTabs (settings, admin, manage posts). The active pill slides between tabs. */
export function PillTabs<T extends string>({ tabs, value, onChange, className }: TabsProps<T>) {
  const { onLayout, markerStyle } = useActiveLayout(value);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={cn("grow-0", className)}>
      <View
        accessibilityRole="tablist"
        className="border-border-input bg-background-alt flex-row gap-1 rounded-input border p-1 shadow-btn"
      >
        <Animated.View
          className="bg-background absolute top-1 bottom-1 left-0 rounded-button shadow-mini"
          style={markerStyle}
        />
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onLayout={onLayout(tab.value)}
              onPress={() => onChange(tab.value)}
              className="h-9 flex-row items-center gap-1.5 rounded-button px-4"
            >
              {tab.icon && (
                <Icon name={tab.icon} size={16} className={selected ? "text-foreground" : "text-muted-foreground"} />
              )}
              <Text size="sm" weight="medium" tone={selected ? "default" : "muted"}>
                {tab.label}
              </Text>
              {tab.count !== undefined && <TabCount count={tab.count} selected={selected} />}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/**
 * Full-width underlined tabs splitting a screen's content (feeds, profile sections), as native apps do. Pills
 * stay for choosing a setting.
 */
export function UnderlineTabs<T extends string>({ tabs, value, onChange, className }: TabsProps<T>) {
  const { onLayout, markerStyle } = useActiveLayout(value, 0.2);

  return (
    <View accessibilityRole="tablist" className={cn("flex-row border-b border-border", className)}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onLayout={onLayout(tab.value)}
            onPress={() => {
              if (!selected) void Haptics.selectionAsync();
              onChange(tab.value);
            }}
            // Grow from the label's own width, so a long label ("Recommendations") never truncates beside short ones.
            className="grow flex-row items-center justify-center gap-1.5 px-2 py-3.5"
          >
            <Text
              size="sm"
              weight={selected ? "semibold" : "medium"}
              tone={selected ? "default" : "muted"}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
            {tab.count !== undefined && <TabCount count={tab.count} selected={selected} />}
          </Pressable>
        );
      })}
      <Animated.View className="bg-foreground absolute -bottom-px left-0 h-[3px] rounded-full" style={markerStyle} />
    </View>
  );
}

/**
 * Filter chips: a row of rounded toggles narrowing the list under a screen's own tabs, so two tab bars never stack.
 */
export function ChipTabs<T extends string>({ tabs, value, onChange, className }: TabsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={cn("grow-0", className)}>
      <View accessibilityRole="tablist" className="flex-row gap-2 px-4">
        {tabs.map((tab) => {
          const selected = tab.value === value;
          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(tab.value)}
              className={cn(
                "h-8 flex-row items-center gap-1.5 rounded-full border px-3.5",
                selected ? "border-foreground bg-foreground" : "border-border-input bg-background",
              )}
            >
              {tab.icon && (
                <Icon name={tab.icon} size={14} className={selected ? "text-background" : "text-muted-foreground"} />
              )}
              <Text size="sm" weight="medium" className={selected ? "text-background" : "text-foreground"}>
                {tab.label}
              </Text>
              {tab.count !== undefined && (
                <Text size="sm" weight="medium" className={selected ? "text-background/70" : "text-muted-foreground"}>
                  {tab.count}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
