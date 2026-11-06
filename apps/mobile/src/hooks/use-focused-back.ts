import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { BackHandler } from "react-native";

/**
 * While `active` and this screen is the one in view, Android's Back runs `action` instead of leaving. Only while
 * focused: a screen stays mounted under the ones pushed above it, and mustn't take their Back. A sheet opened later goes
 * first, as the newest listener does.
 */
export function useFocusedBack(active: boolean, action: () => void) {
  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        action();
        return true;
      });
      return () => subscription.remove();
    }, [active, action]),
  );
}
