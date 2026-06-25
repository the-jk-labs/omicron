// SPDX-License-Identifier: AGPL-3.0-or-later
import * as postsRepo from "@/db/repositories/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for posts. Creating a local post enqueues federation delivery.

export async function createPost(authorId: string, input: {
  title?: string;
  contentHtml: string;
  contentJson?: unknown;
}) {
  const html = input.contentHtml?.trim();
  if (!html) throw badRequest("Post content cannot be empty.");

  const title = input.title?.trim();
  if (!title) throw badRequest("A blog post must have a title.");

  const post = await postsRepo.create({
    authorId,
    title,
    contentHtml: html,
    contentJson: input.contentJson ?? null,
  });

  // Async fan-out to remote followers (no-op when federation is disabled).
  queue.add("federate_post", { postId: post.id });
  return post;
}

export async function getPost(id: string) {
  // `id` is a full UUID or a hex id-prefix from a canonical URL; reject anything
  // else so LIKE wildcards can't reach the query.
  if (!/^[0-9a-f-]{8,}$/i.test(id)) throw notFound("Post not found.");
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  return row;
}

// Edits a post. Only the author may edit, and only local posts (remote posts
// are owned by their origin instance). Re-enqueues federation for the update.
export async function updatePost(authorId: string, id: string, input: {
  title?: string;
  contentHtml?: string;
  contentJson?: unknown;
}) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  if (row.post.remote) throw forbidden("Federated posts cannot be edited here.");
  if (row.post.authorId !== authorId) throw forbidden("You can only edit your own posts.");

  const html = input.contentHtml?.trim();
  if (input.contentHtml !== undefined && !html) throw badRequest("Post content cannot be empty.");

  const title = input.title?.trim();
  if (input.title !== undefined && !title) throw badRequest("A blog post must have a title.");

  const post = await postsRepo.update(id, {
    ...(input.title !== undefined ? { title } : {}),
    ...(html ? { contentHtml: html, contentJson: input.contentJson ?? null } : {}),
  });

  queue.add("federate_post", { postId: post.id });
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
function pageOf(
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

export async function listByAuthor(authorId: string, cursor: Cursor | null) {
  const rows = await postsRepo.listByAuthor(authorId, cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function globalTimeline(cursor: Cursor | null) {
  const rows = await postsRepo.listGlobal(cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}

export async function localTimeline(cursor: Cursor | null) {
  const rows = await postsRepo.listLocal(cursor, DEFAULT_PAGE_SIZE);
  return pageOf(rows, DEFAULT_PAGE_SIZE);
}