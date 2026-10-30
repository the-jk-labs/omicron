import { useSyncExternalStore } from "react";

const isUpdater = <T>(next: T | ((current: T) => T)): next is (current: T) => T => typeof next === "function";

/** A minimal external store for app-wide UI state that lives outside React (toasts, confirm dialogs). */
export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (next: T | ((current: T) => T)) => {
      state = isUpdater(next) ? next(state) : next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type Store<T> = ReturnType<typeof createStore<T>>;

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
