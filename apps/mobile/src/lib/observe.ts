import { Observe } from "expo-observe";
import { useMMKVBoolean } from "react-native-mmkv";
import { storage } from "@/lib/storage";

// What someone reads and whose profile they open stays on the device; hiding one also drops the event's resolved URL.
export const HIDDEN_ROUTE_PARAMS = ["handle", "slug", "id", "postId", "tag", "page"];

// Device-only on purpose (the app opts out of Android backup), so reinstalling turns diagnostics back on.
const KEY = "share-diagnostics";

// `configure` replaces the whole config, so the integration has to be repeated on every call.
function applyDiagnostics(enabled: boolean) {
  Observe.configure({
    dispatchingEnabled: enabled,
    integrations: { "expo-router": { filteredParams: HIDDEN_ROUTE_PARAMS } },
  });
}

export function configureObserve() {
  applyDiagnostics(storage.getBoolean(KEY) ?? true);
}

/** Whether this device sends diagnostics to Expo: on unless its owner turned it off. */
export function useShareDiagnostics(): [boolean, (enabled: boolean) => void] {
  const [saved, setSaved] = useMMKVBoolean(KEY, storage);
  return [
    saved ?? true,
    (enabled) => {
      setSaved(enabled);
      applyDiagnostics(enabled);
    },
  ];
}
