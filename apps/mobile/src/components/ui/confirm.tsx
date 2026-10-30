import { useEffect, useState } from "react";
import { View } from "react-native";
import { pendingConfirm, type ConfirmOptions } from "@/lib/dialogs/confirm";
import { useStore } from "@/lib/store";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Sheet, useSheet } from "./sheet";
import { Text } from "./text";

/** `confirm()` as a bottom sheet, the native way to ask. Swiping it away, the backdrop or Back all cancel. */
export function ConfirmHost() {
  const dialog = useStore(pendingConfirm);
  const sheet = useSheet();
  const [notify, setNotify] = useState(false);
  // The last question stays on screen while the sheet slides away, so it doesn't collapse empty as it goes.
  const [shown, setShown] = useState<ConfirmOptions | null>(dialog);
  if (dialog && dialog !== shown) setShown(dialog);

  useEffect(() => {
    if (dialog) sheet.ref.current?.present();
  }, [dialog, sheet.ref]);

  // Reads the store rather than this render's dialog: the sheet's own dismissal answers after a button did.
  const close = (confirmed: boolean) => {
    const pending = pendingConfirm.get();
    if (!pending) return;
    pending.resolve({ confirmed, notify: confirmed && notify });
    pendingConfirm.set(null);
    setNotify(false);
    sheet.dismiss();
  };

  return (
    <Sheet sheetRef={sheet.ref} onDismiss={() => close(false)}>
      {shown && (
        <View accessibilityRole="alert" className="gap-5 px-5 pt-1">
          <View className="gap-1.5">
            <Text size="lg" weight="semibold">
              {shown.title}
            </Text>
            {shown.description && <Text tone="muted">{shown.description}</Text>}
          </View>
          {shown.notify && <Checkbox checked={notify} onCheckedChange={setNotify} label={shown.notify} />}
          <View className="gap-2">
            <Button
              block
              variant={shown.destructive ? "destructive" : "solid"}
              className="h-12"
              onPress={() => close(true)}
            >
              {shown.confirmText ?? "Continue"}
            </Button>
            <Button block variant="outline" className="h-12" onPress={() => close(false)}>
              {shown.cancelText ?? "Cancel"}
            </Button>
          </View>
        </View>
      )}
    </Sheet>
  );
}
