import { useEffect } from "react";
import { BackHandler } from "react-native";

/** While `open`, Android's Back runs `dismiss` instead of leaving the screen; the newest caller goes first. */
export function useBackDismiss(open: boolean, dismiss: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => subscription.remove();
  }, [open, dismiss]);
}
