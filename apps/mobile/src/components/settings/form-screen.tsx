import type { ReactNode } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, ScreenHeader } from "@/components/layout/screen";

/** A settings page with form fields that stay above the keyboard. */
export function FormScreen({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <ScreenHeader title={title} right={right} />
      <KeyboardAwareScrollView
        contentContainerClassName="gap-6 p-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {children}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
