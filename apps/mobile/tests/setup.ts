import type { fetch } from "react-native-nitro-fetch";
import { afterEach, vi } from "vitest";
import { clearAllMMKV } from "./support/react-native-mmkv";

// Tests flip it per-case with vi.stubGlobal("__DEV__", true); unstubGlobals restores this default.
Object.assign(globalThis, { __DEV__: false });

// Native-only modules pulled in transitively by most of src. Files override these with their own vi.mock.
vi.mock(import("react-native-nitro-fetch"), () => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0", nativeBuildVersion: "7" }));
vi.mock("expo-updates", () => ({ updateId: "update-1" }));
vi.mock(import("expo-haptics"), () => ({ selectionAsync: vi.fn<() => Promise<void>>(async () => undefined) }));

afterEach(async () => {
  clearAllMMKV();
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});
