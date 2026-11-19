import { BackHandler, DeviceEventEmitter } from "react-native";
import { vi } from "vitest";

/** Presses Android Back; false means nothing handled it, so the system would close the screen or app. */
export function pressBack() {
  const exitApp = vi.spyOn(BackHandler, "exitApp").mockImplementation(() => {});
  DeviceEventEmitter.emit("hardwareBackPress");
  const handled = exitApp.mock.calls.length === 0;
  exitApp.mockRestore();
  return handled;
}
