import { cleanup } from "@testing-library/react-native";
import * as rntlMatchers from "@testing-library/react-native/matchers";
import type { fetch } from "react-native-nitro-fetch";
import { afterEach, expect, vi } from "vitest";
import { storage } from "@/lib/storage";

// toBeDisabled, toBeOnTheScreen, toHaveTextContent, … from React Native Testing Library.
expect.extend(rntlMatchers);

// Tests flip it per-case with vi.stubGlobal("__DEV__", true); unstubGlobals restores this default.
Object.assign(globalThis, { __DEV__: false });

// Native-only modules pulled in transitively by most of src. Files override these with their own vi.mock.
// MMKV's built-in test mock never calls Nitro, but importing it would require real react-native.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a stub with none of Nitro's API
vi.mock(import("react-native-nitro-modules"), () => ({ NitroModules: {} as never }));
vi.mock(import("react-native-nitro-fetch"), () => ({ fetch: vi.fn<typeof fetch>() }));
vi.mock("expo-application", () => ({ nativeApplicationVersion: "0.1.0", nativeBuildVersion: "7" }));
vi.mock("expo-updates", () => ({ updateId: "update-1" }));
vi.mock(import("expo-haptics"), () => ({ selectionAsync: vi.fn<() => Promise<void>>(async () => undefined) }));

afterEach(async () => {
  // react-native-mmkv swaps in its own in-memory instance under Vitest; wipe it between tests.
  storage.clearAll();
  await cleanup();
});
