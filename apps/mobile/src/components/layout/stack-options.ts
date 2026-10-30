import { useThemeColor } from "@/hooks/use-theme-colors";

/**
 * Base options for every Stack. Each screen gets the theme background: a transparent one shows the native window
 * (white) through the edges during a transition, which reads as a flash on Android.
 */
export function useStackOptions() {
  const background = useThemeColor("--color-background");
  return {
    headerShown: false,
    contentStyle: { backgroundColor: background },
    // Going deeper (a post, a profile, a settings page) pushes in from the side with the previous screen
    // shifting under it, the same on Android and iOS. Overlays and redirects pick their own below.
    animation: "ios_from_right",
    animationDuration: 280,
    fullScreenGestureEnabled: true,
  } as const;
}
