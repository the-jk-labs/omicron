import * as Network from "expo-network";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useStore } from "@/lib/store";
import { connectivity, setDeviceOnline } from "./connectivity";

// expo-network often reports a passing `isInternetReachable: false` right after the app returns to the
// foreground; going offline is re-checked after this grace period so a blip never flashes the banner.
const OFFLINE_GRACE_MS = 1500;

const reachable = (state: Network.NetworkState) => Boolean(state.isConnected) && state.isInternetReachable !== false;

// A failing probe counts as online: better to attempt requests than to strand the app offline.
const probe = () => Network.getNetworkStateAsync().then(reachable, () => true);

/** Follows the OS network state into `connectivity.device`. Returns the function that stops it. */
export function watchDeviceNetwork(): () => void {
  let stopped = false;
  let offlineTimer: ReturnType<typeof setTimeout> | undefined;

  const apply = (online: boolean) => {
    if (stopped) return;
    if (online) {
      clearTimeout(offlineTimer);
      offlineTimer = undefined;
      setDeviceOnline(true);
      return;
    }
    if (offlineTimer !== undefined) return;
    offlineTimer = setTimeout(() => {
      offlineTimer = undefined;
      void probe().then((stillOnline) => !stopped && setDeviceOnline(stillOnline));
    }, OFFLINE_GRACE_MS);
  };

  void probe().then(apply);
  const network = Network.addNetworkStateListener((state) => apply(reachable(state)));
  const appState = AppState.addEventListener("change", (next) => {
    if (next === "active") void probe().then(apply);
  });

  return () => {
    stopped = true;
    clearTimeout(offlineTimer);
    network.remove();
    appState.remove();
  };
}

/** Keeps `connectivity.device` in step with the OS. Mount once, at the root. */
export function useDeviceNetwork() {
  useEffect(() => watchDeviceNetwork(), []);
}

export const useConnectivity = () => useStore(connectivity);

/** True while requests are paused: the phone is offline or the instance isn't answering. */
export function useIsOffline() {
  const { device, instance } = useConnectivity();
  return device === "offline" || instance === "down";
}
