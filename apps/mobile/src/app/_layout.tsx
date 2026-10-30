import "../global.css";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useStackOptions } from "@/components/layout/stack-options";
import { EmptyState } from "@/components/ui/states";
import { useSavedInstance } from "@/lib/instance/store";
import { useDeviceNetwork } from "@/lib/network/use-device-network";
import { installQueryAppState } from "@/lib/query/app-state";
import { applySavedTheme } from "@/lib/theme/theme";

// Before the first render, so the saved theme is already in place when the splash screen lifts.
applySavedTheme();
installQueryAppState();
void SplashScreen.preventAutoHideAsync();

/** Last resort when the app shell itself throws; screens have their own boundary (`ScreenError`). */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View className="bg-background flex-1 justify-center">
      <EmptyState
        icon="triangle-alert"
        title="Something went wrong"
        description="Omicron hit an unexpected error."
        action={{ label: "Try again", onPress: () => void retry() }}
      />
    </View>
  );
}

export default function RootLayout() {
  const instance = useSavedInstance();
  useDeviceNetwork();
  const stackOptions = useStackOptions();
  const background = stackOptions.contentStyle.backgroundColor;

  // The native root view shows behind screens mid-transition and behind the keyboard; keep it on theme.
  useEffect(() => {
    if (background) void SystemUI.setBackgroundColorAsync(background);
  }, [background]);

  // Everything the first screen needs (theme, instance, persisted cache) is read synchronously.
  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <GestureHandlerRootView className="bg-background flex-1">
      <KeyboardProvider>
        <StatusBar style="auto" />
        {/* Choosing an instance swaps the whole app, so it cross-fades rather than pushing. */}
        <Stack screenOptions={{ ...stackOptions, animation: "fade" }}>
          <Stack.Protected guard={instance === null}>
            <Stack.Screen name="welcome" />
          </Stack.Protected>
          <Stack.Protected guard={instance !== null}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
