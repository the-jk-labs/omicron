import { focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";

let installed = false;

/** Refetch stale queries when the app returns to the foreground, as a browser tab regaining focus would. */
export function installQueryAppState() {
  if (installed) return;
  installed = true;
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state) => setFocused(state === "active"));
    return () => subscription.remove();
  });
}
