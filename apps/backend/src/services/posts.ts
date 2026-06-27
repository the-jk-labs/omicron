// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import { MAX_TAGS_PER_POST, normalizeTags } from "@/lib/tags.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for posts. Creating a local post enqueues federation delivery.

// Normalizes and validates author-supplied tags, capping the count per post.
function resolveTags(raw: string[]): string[] {
  const slugs = normalizeTags(raw);
  if (slugs.length > MAX_TAGS_PER_POST) {
    throw badRequest(`A post can have at most ${MAX_TAGS_PER_POST} tags.`);
  }
  return slugs;
}

export async function createPost(authorId: string, input: {
  title?: string;
  contentHtml: string;
  contentJson?: unknown;
  status?: string;
  tags?: string[];
}) {
  const status = input.status === "draft" ? "draft" : "published";

  const html = input.contentHtml?.trim();
  if (!html) throw badRequest("Post content cannot be empty.");

  // A title is required to publish; drafts may be saved untitled (work in progress).
  const title = input.title?.trim();
  if (status === "published" && !title) throw badRequest("A blog post must have a title.");

  const tags = input.tags !== undefined ? resolveTags(input.tags) : undefined;

  const post = await postsRepo.create({
    authorId,
    title: title || null,
    contentHtml: html,
    contentJson: input.contentJson ?? null,
    status,
  });

  if (tags !== undefined) await tagsRepo.setPostTags(post.id, tags);

  // Only published posts fan out to remote followers; drafts stay private.
  if (status === "published") queue.add("federate_post", { postId: post.id });
  return post;
}

export async function getPost(id: string, viewerId: string | null = null) {
  // `id` is a full UUID or a hex id-prefix from a canonical URL; reject anything
  // else so LIKE wildcards can't reach the query.
  if (!/^[0-9a-f-]{8,}$/i.test(id)) throw notFound("Post not found.");
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  // Drafts are private to their author — anyone else gets a plain not-found.
  if (row.post.status === "draft" && row.post.authorId !== viewerId) {
    throw notFound("Post not found.");
  }
  return row;
}

export async function listDrafts(authorId: string, cursor: Cursor | null) {
  const rows = await postsRepo.listDraftsByAuthor(authorId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

// Edits a post. Only the author may edit, and only local posts (remote posts
// are owned by their origin instance). Re-enqueues federation for the update.
export async function updatePost(authorId: string, id: string, input: {
  title?: string;
  contentHtml?: string;
  contentJson?: unknown;
  status?: string;
  tags?: string[];
}) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be edited here.");
  if (row.post.authorId !== authorId) throw forbidden("You can only edit your own posts.");

  const status = input.status === undefined
    ? row.post.status
    : input.status === "draft"
    ? "draft"
    : "published";

  const html = input.contentHtml?.trim();
  if (input.contentHtml !== undefined && !html) throw badRequest("Post content cannot be empty.");

  const title = input.title?.trim();
  // Untitled drafts are allowed, but a post must have a title to be published.
  const resolvedTitle = input.title !== undefined ? (title || null) : row.post.title;
  if (status === "published" && !resolvedTitle) {
    throw badRequest("A blog post must have a title.");
  }

  const changes = {
    ...(input.title !== undefined ? { title: title || null } : {}),
    ...(html ? { contentHtml: html, contentJson: input.contentJson ?? null } : {}),
    ...(input.status !== undefined ? { status } : {}),
  };

  // A tags-only edit touches no post columns; skip the update (drizzle rejects
  // an empty SET) and keep the existing row.
  const post = Object.keys(changes).length > 0
    ? await postsRepo.update(id, changes)
    : row.post;

  // Tags are replaced wholesale when provided; an empty array clears them.
  if (input.tags !== undefined) await tagsRepo.setPostTags(post.id, resolveTags(input.tags));

  // Federate only published posts. Publishing a draft (draft → published) fans
  // out for the first time here; edits to an already-published post re-deliver.
  if (post.status === "published") queue.add("federate_post", { postId: post.id });
  return post;
}

// Deletes a post. The author or an admin may delete; only local posts.
export async function deletePost(userId: string, isAdmin: boolean, id: string) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be deleted here.");
  if (row.post.authorId !== userId && !isAdmin) {
    throw forbidden("You can only delete your own posts.");
  }
  await postsRepo.remove(id);
}

// Pagination over the nested {post, author} rows returned by the repo.
export function pageOf(
  rows: postsRepo.PostWithAuthor[],
  limit: number,
): { items: postsRepo.PostWithAuthor[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last
      ? encodeCursor({ createdAt: last.post.createdAt.toISOString(), id: last.post.id })
      : null,
  };
}

export async function listByAuthor(
  authorId: string,
  cursor: Cursor | null,
  viewerId: string | null = null,
) {
  const rows = await postsRepo.listByAuthor(authorId, viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function globalTimeline(cursor: Cursor | null, viewerId: string | null = null) {
  const rows = await postsRepo.listGlobal(viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function localTimeline(cursor: Cursor | null, viewerId: string | null = null) {
  const rows = await postsRepo.listLocal(viewerId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}
