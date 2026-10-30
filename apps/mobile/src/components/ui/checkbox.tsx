import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn } from "tailwind-variants";
import { Icon } from "./icon";
import { Text } from "./text";

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Text, or Text with nested links (a link press wins over toggling). */
  label: ReactNode;
  description?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onCheckedChange(!checked)}
      className="flex-row items-start gap-3 py-1"
    >
      <View
        className={cn(
          "mt-0.5 size-5 items-center justify-center rounded-[4px] border border-border-input",
          checked && "border-dark bg-dark",
        )}
      >
        {checked && <Icon name="check" size={14} className="text-background" />}
      </View>
      <View className="flex-1 gap-0.5">
        <Text size="sm" weight="medium">
          {label}
        </Text>
        {description && (
          <Text size="xs" tone="muted">
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
