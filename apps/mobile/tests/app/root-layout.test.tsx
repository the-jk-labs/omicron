// @vitest-environment happy-dom
// oxlint-disable typescript/unbound-method -- deliberately partial test doubles
import { render } from "@testing-library/react";
import { Observe } from "expo-observe";
import * as SplashScreen from "expo-splash-screen";
import type { ComponentType, ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { configureObserve } from "@/lib/observe";

const events = vi.hoisted(() => [] as string[]);

vi.mock("expo-observe", () => ({
  Observe: { markInteractive: vi.fn<() => void>() },
  ObserveRoot: {
    wrap: (Component: ComponentType) =>
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- vi.mock factories run before module scope
      function Wrapped() {
        events.push("rendered");
        return <Component />;
      },
  },
}));
vi.mock("@/lib/observe", () => ({ configureObserve: vi.fn<() => void>(() => void events.push("configured")) }));
vi.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: vi.fn<() => Promise<boolean>>(),
  hide: vi.fn<() => void>(),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-system-ui", () => ({ setBackgroundColorAsync: vi.fn<() => Promise<void>>() }));
vi.mock("expo-router", () => ({
  Stack: Object.assign(() => null, { Protected: () => null, Screen: () => null }),
}));
vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/layout/stack-options", () => ({ useStackOptions: () => ({ contentStyle: {} }) }));
vi.mock("@/components/ui/states", () => ({ EmptyState: () => null }));
vi.mock("@/lib/instance/store", () => ({ useSavedInstance: () => null }));
vi.mock("@/lib/network/use-device-network", () => ({ useDeviceNetwork: () => undefined }));
vi.mock("@/lib/query/app-state", () => ({ installQueryAppState: () => undefined }));
vi.mock("@/lib/theme/theme", () => ({ applySavedTheme: () => undefined }));

test("Observe is configured before the first render and marks the app interactive once it's up", async () => {
  const { default: RootLayout } = await import("@/app/_layout");
  render(<RootLayout />);
  expect(configureObserve).toHaveBeenCalledOnce();
  expect(events).toEqual(["configured", "rendered"]);
  expect(SplashScreen.hide).toHaveBeenCalledOnce();
  expect(Observe.markInteractive).toHaveBeenCalledOnce();
});
