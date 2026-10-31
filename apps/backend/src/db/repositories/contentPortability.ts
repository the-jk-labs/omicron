// SPDX-License-Identifier: AGPL-3.0-or-later
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client.ts";
import { postColumns } from "@/db/repositories/posts.ts";
import { resolveSlugs } from "@/db/repositories/tags.ts";
import { type NewPost, posts, postTags, tags } from "@/db/schema.ts";

export function listOwn(authorId: string, limit: number) {
  return db
    .select(postColumns)
    .from(posts)
    .where(and(eq(posts.authorId, authorId), eq(posts.remote, false)))
    .orderBy(posts.createdAt, posts.id)
    .limit(limit);
}

export function identities(authorId: string) {
  return db
    .select({ id: posts.id, externalId: posts.externalId })
    .from(posts)
    .where(and(eq(posts.authorId, authorId), eq(posts.remote, false)));
}

// Commit the post and tags together. Concurrent retries skip, never overwrite.
export async function insertPost(data: NewPost, slugs: string[]) {
  const canonical = [...new Set(await resolveSlugs(slugs))];
  return db.transaction(async (tx) => {
    const [post] = await tx
      .insert(posts)
      .values(data)
      .onConflictDoNothing({ target: [posts.authorId, posts.externalId] })
      .returning();
    if (!post) return null;
    if (canonical.length) {
      await tx
        .insert(tags)
        .values(canonical.map((slug) => ({ slug, name: slug })))
        .onConflictDoNothing({ target: tags.slug });
      const rows = await tx.select({ id: tags.id }).from(tags).where(inArray(tags.slug, canonical));
      await tx.insert(postTags).values(rows.map((tag) => ({ postId: post.id, tagId: tag.id })));
    }
    return post;
  });
}
