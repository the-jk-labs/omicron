import { useCSSVariable } from "uniwind";

/**
 * Current values of theme colour tokens (`--color-*` in global.css), for props that take a colour rather than a
 * class: SVG fills, sheet backgrounds, Reanimated colour interpolation, the editor WebView's CSS.
 */
export function useThemeColors(names: string[]): string[] {
  const values = useCSSVariable(names);
  return values.map((value) => (typeof value === "string" ? value : ""));
}

export function useThemeColor(name: string): string {
  const value = useCSSVariable(name);
  return typeof value === "string" ? value : "";
}
