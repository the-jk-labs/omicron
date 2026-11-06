import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { createStore, useStore } from "@/lib/store";

// Lets the app settle first: this hands 1.1 MB of HTML to a new WebView.
const PRELOAD_DELAY_MS = 3000;

/** Whether a composer screen exists, open or waiting hidden. */
const composerMounted = createStore(false);

/** Marks a composer screen as existing while it's mounted, so a second one is never preloaded. */
export function useComposerMounted() {
  useEffect(() => {
    composerMounted.set(true);
    return () => composerMounted.set(false);
  }, []);
}

/**
 * Keeps a booted composer waiting behind the app, so Write opens it at once; opening a draft reuses the screen too.
 * A second preload would replace the waiting editor and boot it again, so this only runs when none exists.
 * Android only: preloading a modal hasn't been tried on iOS.
 */
export function useComposerPreload(enabled: boolean) {
  const mounted = useStore(composerMounted);
  useEffect(() => {
    if (!enabled || mounted || Platform.OS !== "android") return undefined;
    let idle: number | undefined;
    const timer = setTimeout(() => {
      idle = requestIdleCallback(() => {
        composerMounted.set(true);
        router.prefetch("/compose");
      });
    }, PRELOAD_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [enabled, mounted]);
}
