import { useMMKVString } from "react-native-mmkv";
import * as z from "zod/mini";
import { storage } from "@/lib/storage";

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

/** The instance the app talks to, or null before the user has picked one. Re-renders when it changes. */
export function useSavedInstance(): SavedInstance | null {
  const [raw] = useMMKVString(KEY, storage);
  return parse(raw);
}
