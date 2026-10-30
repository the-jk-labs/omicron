import type { Post } from "@omicron/contract";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

const isPost = (value: object, id: string): value is Post => "id" in value && value.id === id && "likeCount" in value;

/**
 * Returns `data` with every copy of post `id` replaced by `update(post)`, sharing every untouched branch.
 * Posts sit in many shapes (pages, `{ post }`, `{ items }`, search results); walking them all keeps every
 * screen showing one post the same way.
 */
export function patchPosts(data: unknown, id: string, update: (post: Post) => Post, depth = 0): unknown {
  if (depth > 6 || typeof data !== "object" || data === null) return data;
  if (isPost(data, id)) return update(data);
  if (Array.isArray(data)) {
    let changed = false;
    const next = data.map((item: unknown) => {
      const patched = patchPosts(item, id, update, depth + 1);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : data;
  }
  let next: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(data)) {
    const patched = patchPosts(value, id, update, depth + 1);
    if (patched !== value) (next ??= { ...data })[key] = patched;
  }
  return next ?? data;
}

export type CacheSnapshot = [QueryKey, unknown][];

/** Applies `update` to post `id` in every cached query; returns what to restore if the request fails. */
export function updatePostEverywhere(client: QueryClient, id: string, update: (post: Post) => Post): CacheSnapshot {
  const snapshot: CacheSnapshot = [];
  for (const query of client.getQueryCache().getAll()) {
    const data = query.state.data;
    const next = patchPosts(data, id, update);
    if (next !== data) {
      snapshot.push([query.queryKey, data]);
      client.setQueryData(query.queryKey, next);
    }
  }
  return snapshot;
}

export function restoreSnapshot(client: QueryClient, snapshot: CacheSnapshot) {
  for (const [key, data] of snapshot) client.setQueryData(key, data);
}

function isPostAt(value: object, username: string, slug: string): value is Post {
  if (!("likeCount" in value && "contentHtml" in value && "id" in value && "slug" in value && "author" in value))
    return false;
  const { author, id } = value;
  return (
    typeof author === "object" &&
    author !== null &&
    "username" in author &&
    author.username === username &&
    (value.slug === slug || (typeof id === "string" && id.startsWith(slug)))
  );
}

function findPost(data: unknown, username: string, slug: string, depth = 0): Post | undefined {
  if (depth > 6 || typeof data !== "object" || data === null) return undefined;
  if (isPostAt(data, username, slug)) return data;
  for (const value of Array.isArray(data) ? data : Object.values(data)) {
    const found = findPost(value, username, slug, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The post at `/@username/slug` as any cached list already holds it (a feed card, a profile), so the reader opens
 * on it at once. */
export function findCachedPost(client: QueryClient, username: string, slug: string): Post | undefined {
  for (const query of client.getQueryCache().getAll()) {
    const found = findPost(query.state.data, username, slug);
    if (found) return found;
  }
  return undefined;
}
