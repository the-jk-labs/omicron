import type { Post, ReadingList } from "@omicron/contract";

// Routes mirror the web's paths (`/@user`, `/@user/slug`), so a shared link maps straight onto a screen.

/** Canonical path for a post, e.g. `/@user/some-title`. Ported from apps/frontend/src/lib/links.ts. */
export function postPath(post: Pick<Post, "id" | "slug"> & { author: { username: string } }): string {
  return `/@${post.author.username}/${post.slug || post.id.slice(0, 8)}`;
}

/** `/@ada`, or `/@ada@remote.example` for a federated account. */
export const profilePath = (username: string) => `/@${username}`;

export const tagPath = (slug: string) => `/tags/${encodeURIComponent(slug)}`;

export const listPath = (list: Pick<ReadingList, "id">) => `/lists/${list.id}`;

/** The route's `[handle]` param (`@ada` or `@ada@host`) as the API's username. */
export const usernameFromHandle = (handle: string) => decodeURIComponent(handle).replace(/^@/, "");

/** Remote accounts are addressed `user@host`; local ones by bare username. */
export const isRemoteUsername = (username: string) => username.includes("@");
