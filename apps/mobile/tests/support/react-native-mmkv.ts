import { useState } from "react";

// In-memory MMKV (aliased in vitest.config.ts). Cleared after every test in tests/setup.ts.
const instances: Map<string, string | number | boolean>[] = [];

export function useMMKVBoolean(key: string, instance: ReturnType<typeof createMMKV>) {
  const [value, setValue] = useState(() => instance.getBoolean(key));
  const set = (next: boolean) => {
    instance.set(key, next);
    setValue(next);
  };
  return [value, set] as const;
}

export function createMMKV() {
  const map = new Map<string, string | number | boolean>();
  instances.push(map);
  return {
    getString: (key: string) => {
      const value = map.get(key);
      return typeof value === "string" ? value : undefined;
    },
    getBoolean: (key: string) => {
      const value = map.get(key);
      return typeof value === "boolean" ? value : undefined;
    },
    set: (key: string, value: string | number | boolean) => void map.set(key, value),
    remove: (key: string) => map.delete(key),
    contains: (key: string) => map.has(key),
    clearAll: () => map.clear(),
  };
}

export function clearAllMMKV() {
  for (const map of instances) map.clear();
}
