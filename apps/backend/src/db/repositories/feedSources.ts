// SPDX-License-Identifier: AGPL-3.0-or-later
import { eq, or, sql } from "drizzle-orm";
import { posts, recommendations } from "@/db/schema.ts";

function followedLocal(userId: string) {
  return sql`(select followee_id from follows
    where follower_id = ${userId} and followee_id is not null and approved = true)`;
}

function followedRemote(userId: string) {
  return sql`(select remote_followee_id from follows
    where follower_id = ${userId} and remote_followee_id is not null and approved = true)`;
}

export function authoredFeedSource(userId: string) {
  return or(
    eq(posts.authorId, userId),
    sql`${posts.authorId} in ${followedLocal(userId)}`,
    sql`${posts.remoteActorId} in ${followedRemote(userId)}`,
    sql`${posts.id} in (
      select pt.post_id from post_tags pt
      join tag_follows tf on tf.tag_id = pt.tag_id where tf.user_id = ${userId}
    )`,
  );
}

export function recommendedFeedSource(userId: string) {
  return or(
    sql`${recommendations.userId} in ${followedLocal(userId)}`,
    sql`${recommendations.remoteActorId} in ${followedRemote(userId)}`,
  );
}
