// Opaque cursor for keyset pagination over (created_at, id) tuples.
// Never use OFFSET — cursors stay correct as rows are inserted.

export type Cursor = { createdAt: string; id: string };

export function encodeCursor(c: Cursor): string {
  return btoa(`${c.createdAt}|${c.id}`);
}

export function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = atob(raw).split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

export const DEFAULT_PAGE_SIZE = 20;

// Given one extra row fetched (limit + 1), split into page + nextCursor.
export function paginate<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null,
  };
}
