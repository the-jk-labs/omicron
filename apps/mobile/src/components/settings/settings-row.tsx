import type { ReactNode } from "react";
import { View } from "react-native";
import { Icon, type IconName } from "@/components/ui/icon";
import { PressableScale } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";

export function SettingsSection({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <View className="gap-2">
      {title && (
        <Text size="xs" weight="semibold" tone="muted" className="px-1 uppercase">
          {title}
        </Text>
      )}
      <View className="overflow-hidden rounded-card border border-border-card bg-background-alt">{children}</View>
      {footer && (
        <Text size="xs" tone="muted" className="px-1">
          {footer}
        </Text>
      )}
    </View>
  );
}

/** One row in a settings group: icon, label, optional detail, and a chevron or a trailing control. */
export function SettingsRow({
  icon,
  label,
  detail,
  onPress,
  trailing,
  destructive = false,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  destructive?: boolean;
}) {
  return (
    <PressableScale
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      pressedScale={0.99}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
    >
      {icon && <Icon name={icon} size={18} className={destructive ? "text-destructive" : "text-foreground-alt"} />}
      <View className="flex-1 gap-0.5">
        <Text weight="medium" tone={destructive ? "destructive" : "default"}>
          {label}
        </Text>
        {detail ? (
          <Text size="xs" tone="muted" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress && <Icon name="chevron-right" size={16} className="text-muted-foreground" />)}
    </PressableScale>
  );
}
