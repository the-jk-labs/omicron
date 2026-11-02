import { useMMKVString } from "react-native-mmkv";
import * as z from "zod/mini";
import { storage } from "@/lib/storage";
import { createStore } from "@/lib/store";

const savedInstanceSchema = z.object({ origin: z.string(), name: z.string() });

export type SavedInstance = z.infer<typeof savedInstanceSchema>;

const KEY = "instance";

function parse(raw: string | undefined): SavedInstance | null {
  if (!raw) return null;
  try {
    const parsed = savedInstanceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const readInstance = () => parse(storage.getString(KEY));
export const saveInstance = (instance: SavedInstance) => storage.set(KEY, JSON.stringify(instance));
export const clearInstance = () => storage.remove(KEY);

/** Set when an instance was just chosen: the app opens on its sign-in screen, which can be put off. */
export const signInPrompt = createStore(false);

/** Saves the instance someone just picked and asks them to sign in to it first. */
export function chooseInstance(instance: SavedInstance) {
  signInPrompt.set(true);
  saveInstance(instance);
}

/** The instance the app talks to, or null before the user has picked one. Re-renders when it changes. */
export function useSavedInstance(): SavedInstance | null {
  const [raw] = useMMKVString(KEY, storage);
  return parse(raw);
}
