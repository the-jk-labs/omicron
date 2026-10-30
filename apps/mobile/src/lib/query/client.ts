import { API_VERSION } from "@omicron/contract";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, QueryClient, type Query } from "@tanstack/react-query";
import type { PersistedClient, PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import { ApiError } from "@/lib/api/client";
import { ContractError } from "@/lib/api/parse";
import { storage } from "@/lib/storage";

export const MAX_CACHE_TIME = 1000 * 60 * 60 * 24 * 7;

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: MAX_CACHE_TIME,
        // A 4xx or a response the contract can't read won't change on retry; only transient failures are worth another go.
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status < 500) && !(error instanceof ContractError),
      },
    },
  });
}

// `maxAge` only checks the snapshot's timestamp, which every save refreshes; without a per-query cutoff
// every page ever opened would be re-persisted forever.
export function shouldPersistQuery(query: Query) {
  return (
    // A failed refetch keeps the last good data, which must survive going offline too.
    (defaultShouldDehydrateQuery(query) || query.state.data !== undefined) &&
    Date.now() - query.state.dataUpdatedAt < MAX_CACHE_TIME &&
    query.meta?.persist !== false
  );
}

// Only worth having fresh; everything else (every post, profile and list opened) is kept.
const SKIP_PERSIST = new Set(["search", "tag-suggest", "admin-reports", "admin-users", "admin-user", "sessions"]);
// A list reopens at its top, and further pages load as it scrolls.
const PERSISTED_PAGES = 2;

const isPaged = (data: unknown): data is { pages: unknown[]; pageParams: unknown[] } =>
  typeof data === "object" && data !== null && "pages" in data && Array.isArray(data.pages);

/**
 * The cache as it is written to storage. The whole snapshot is serialised on the JS thread after every change, so
 * it leaves out what no page opens faster for: list pages past the first ones, and searches.
 */
export function trimForPersist(client: PersistedClient): PersistedClient {
  const queries = client.clientState.queries.flatMap((query) => {
    const kind = query.queryKey[0];
    if (typeof kind === "string" && SKIP_PERSIST.has(kind)) return [];
    const { data } = query.state;
    if (!isPaged(data) || data.pages.length <= PERSISTED_PAGES) return [query];
    const pages = {
      pages: data.pages.slice(0, PERSISTED_PAGES),
      pageParams: data.pageParams.slice(0, PERSISTED_PAGES),
    };
    return [{ ...query, state: { ...query.state, data: pages } }];
  });
  return { ...client, clientState: { ...client.clientState, queries } };
}

/**
 * Saved data is read back without the contract check a fresh response gets, so it's dropped whenever the app's code
 * changes (a new build or an over-the-air update) or the contract's version moves.
 */
export function cacheBuster(
  build = Application.nativeBuildVersion,
  update = Updates.updateId,
  version: number = API_VERSION,
) {
  return `${version}:${build ?? ""}:${update ?? ""}`;
}

/** Persistence for one instance's cache, so switching instances never shows another's data. */
export function persistOptionsFor(origin: string): Omit<PersistQueryClientOptions, "queryClient"> {
  const key = `query-cache:${origin}`;
  return {
    persister: createAsyncStoragePersister({
      key,
      storage: {
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => void storage.remove(name),
      },
      throttleTime: 2000,
      serialize: (client) => JSON.stringify(trimForPersist(client)),
    }),
    maxAge: MAX_CACHE_TIME,
    buster: cacheBuster(),
    dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
  };
}

export const clearPersistedCache = (origin: string) => storage.remove(`query-cache:${origin}`);
