import { Uniwind } from "uniwind";
import { storage } from "@/lib/storage";

export type ThemePreference = "light" | "dark" | "system";

const KEY = "theme";
const isPreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";

export function readThemePreference(): ThemePreference {
  const saved = storage.getString(KEY);
  return isPreference(saved) ? saved : "system";
}

export function setThemePreference(preference: ThemePreference) {
  storage.set(KEY, preference);
  Uniwind.setTheme(preference);
}

/** Applies the saved theme before the first render, so the app never flashes the wrong one. */
export function applySavedTheme() {
  Uniwind.setTheme(readThemePreference());
}
