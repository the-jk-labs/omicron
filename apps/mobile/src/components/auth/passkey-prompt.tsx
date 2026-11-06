import { useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { FormError } from "@/components/auth/auth-shell";
import { useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet, useSheet } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import type { InstanceAuthClient } from "@/lib/auth/auth-client";
import { dismissPasskeyPrompt, passkeyPromptDismissed } from "@/lib/auth/passkey-prompt";
import { addPasskey, loadPasskeys, usePasskeysAvailable } from "@/lib/auth/passkeys";
import { useViewer } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";

// Lets Home appear first, so the offer doesn't greet the reader on arrival.
const OFFER_DELAY_MS = 1500;

/** Marks the account checked, then makes the offer after a moment if it has no passkeys. Returns what cancels it. */
function offerIfNone(auth: InstanceAuthClient, checked: () => () => void) {
  let left = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  void loadPasskeys(auth).then(
    (passkeys) => {
      if (left) return;
      const offer = checked();
      if (passkeys.length === 0) timer = setTimeout(offer, OFFER_DELAY_MS);
    },
    () => undefined,
  );
  return () => {
    left = true;
    clearTimeout(timer);
  };
}

/** Offers a passkey once per sign-in to someone who has none, as the web does. Mounted on Home. */
export function PasskeyPrompt() {
  const { auth, origin } = useInstance();
  const { user } = useViewer();
  const available = usePasskeysAvailable();
  const queryClient = useQueryClient();
  const sheet = useSheet();
  const [step, setStep] = useState<"offer" | "added">("offer");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkedFor = useRef<string | null>(null);
  const userId = user?.id ?? null;

  // Signing out clears this, or the same account signing back in would be skipped.
  useEffect(() => {
    if (!userId) checkedFor.current = null;
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!userId || !available || checkedFor.current === userId || passkeyPromptDismissed(origin)) return undefined;
      return offerIfNone(auth, () => {
        checkedFor.current = userId;
        return () => {
          setStep("offer");
          setError(null);
          sheet.present();
        };
      });
    }, [auth, available, origin, sheet, userId]),
  );

  const add = async () => {
    setError(null);
    setAdding(true);
    const result = await addPasskey(auth);
    setAdding(false);
    if (result === "added") {
      setStep("added");
      await queryClient.invalidateQueries({ queryKey: queryKeys.passkeys });
    } else if (result === "needs-password") {
      sheet.dismiss();
      router.push({ pathname: "/settings/passkeys", params: { confirm: "1" } });
    } else if (result !== "cancelled") {
      setError(result.message);
    }
  };

  return (
    <Sheet sheetRef={sheet.ref} onDismiss={() => dismissPasskeyPrompt(origin)}>
      <View className="gap-3 px-5 pt-1 pb-2">
        <View className="flex-row items-center gap-3">
          <View className="size-9 items-center justify-center rounded-full bg-muted">
            <Icon name={step === "added" ? "check" : "key-round"} size={18} className="text-foreground" />
          </View>
          <Text size="lg" weight="semibold" className="flex-1">
            {step === "added" ? "Passkey added" : "Sign in faster with a passkey"}
          </Text>
        </View>
        <Text tone="muted">
          {step === "added"
            ? "Next time, choose your passkey when you sign in. You can rename or remove it in Settings."
            : "Use your fingerprint, face, or screen lock instead of your password."}
        </Text>
        <FormError message={error} />
        {step === "added" ? (
          <Button variant="solid" onPress={sheet.dismiss}>
            Done
          </Button>
        ) : (
          <View className="gap-2">
            <Button variant="solid" loading={adding} onPress={() => void add()}>
              {adding ? "Waiting for your device…" : "Add a passkey"}
            </Button>
            <Button variant="ghost" onPress={sheet.dismiss}>
              Not now
            </Button>
          </View>
        )}
      </View>
    </Sheet>
  );
}
