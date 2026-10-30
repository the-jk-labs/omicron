import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

/**
 * Refetches `keys` in the background each time the screen comes into view, while it keeps showing what's cached:
 * a settings page opened again shows changes made elsewhere (the web, another device) without a pull.
 * `keys` must be stable (a module constant), or it refetches on every render.
 */
export function useRefreshOnFocus(keys: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      for (const queryKey of keys) {
        // `cancelRefetch: false` joins a fetch already running (the screen's own first load) instead of repeating it.
        void queryClient.refetchQueries({ queryKey, type: "active" }, { cancelRefetch: false });
      }
    }, [queryClient, keys]),
  );
}
