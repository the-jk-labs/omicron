import type { ReactNode } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InstanceLogo } from "@/components/layout/instance-logo";
import { IconButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { goBack } from "@/lib/navigation";

/** The centred card layout the web's /login and /register pages share. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <View className="px-2" style={{ paddingTop: insets.top + 4 }}>
        <IconButton icon="x" label="Close" onPress={goBack} iconClassName="text-foreground" />
      </View>
      {/* Ends above the system navigation bar, so no field or button ever sits behind it. */}
      <KeyboardAwareScrollView
        className="flex-1"
        style={{ marginBottom: insets.bottom }}
        contentContainerClassName="gap-6 px-6 pb-8"
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View className="items-center gap-3 pt-2">
          <InstanceLogo size={56} />
          <Text size="2xl" weight="bold" className="text-center">
            {title}
          </Text>
          {subtitle && (
            <Text tone="muted" className="text-center">
              {subtitle}
            </Text>
          )}
        </View>
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      className="rounded-input border border-destructive/30 bg-destructive/10 px-3 py-2.5"
    >
      <Text size="sm" tone="destructive">
        {message}
      </Text>
    </View>
  );
}
