import type { Page } from "@omicron/contract";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { useMemo } from "react";

/** Flattens cursor pages into one list, dropping repeats that shift between pages as new items arrive. */
export function flattenPages<T extends { id: string }>(pages: readonly Page<T>[] | undefined): T[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const items: T[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

/**
 * A cursor-paginated list (`{ items, nextCursor }`). Cursors are opaque and passed back unchanged, as the API
 * requires; never offsets.
 */
export function usePagedQuery<T extends { id: string }>(
  queryKey: QueryKey,
  fetchPage: (cursor: string | null) => Promise<Page<T>>,
  options: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Bounds memory (and the persisted cache) on a very long scroll session.
    maxPages: 20,
    enabled: options.enabled,
  });
  const items = useMemo(() => flattenPages(query.data?.pages), [query.data]);

  return {
    ...query,
    items,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
    },
  };
}
