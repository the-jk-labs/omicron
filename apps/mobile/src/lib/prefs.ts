import { useMMKVString } from "react-native-mmkv";
import * as z from "zod/mini";
import type { FeedTab, LangFilter } from "@/lib/api/endpoints";
import { parseJson } from "@/lib/json";
import { storage } from "@/lib/storage";

// Reader preferences the web keeps in cookies/localStorage, kept on the device here.

const langFilterSchema = z.object({ langMode: z.enum(["show", "hide"]), langs: z.string().check(z.minLength(1)) });

const isFeedTab = (value: unknown): value is FeedTab => value === "for-you" || value === "local" || value === "global";

/** The feed Home opens on: the saved choice, else For you when signed in, as on the web. */
export function homeFeed(saved: FeedTab | null, signedIn: boolean): FeedTab {
  if (!signedIn) return saved === "global" ? "global" : "local";
  return saved ?? "for-you";
}

export function useDefaultFeed(): [FeedTab | null, (tab: FeedTab) => void] {
  const [raw, setRaw] = useMMKVString("default-feed", storage);
  return [isFeedTab(raw) ? raw : null, (tab) => setRaw(tab)];
}

/** Show or hide posts in the chosen languages on the Local and Global timelines. */
export function useFeedLangFilter(): [LangFilter | null, (filter: LangFilter | null) => void] {
  const [raw, setRaw] = useMMKVString("feed-lang-filter", storage);
  const parsed = langFilterSchema.safeParse(raw ? parseJson(raw) : null);
  return [parsed.success ? parsed.data : null, (next) => setRaw(next?.langs ? JSON.stringify(next) : undefined)];
}
