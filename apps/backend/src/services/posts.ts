import * as postsRepo from "@/db/repositories/posts.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, notFound } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for posts. Creating a local post enqueues federation delivery.

export async function createPost(authorId: string, input: {
  title?: string;
  contentHtml: string;
  contentJson?: unknown;
}) {
  const html = input.contentHtml?.trim();
  if (!html) throw badRequest("Post content cannot be empty.");

  const post = await postsRepo.create({
    authorId,
    title: input.title?.trim() || null,
    contentHtml: html,
    contentJson: input.contentJson ?? null,
  });

  // Async fan-out to remote followers (no-op when federation is disabled).
  queue.add("federate_post", { postId: post.id });
  return post;
}

export async function getPost(id: string) {
  const row = await postsRepo.findById(id);
  if (!row) throw notFound("Post not found.");
  return row;
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
