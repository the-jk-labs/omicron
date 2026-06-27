// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import { Article, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import type { Post } from "@/db/schema.ts";

// Builds the ActivityPub Article for a local post. Omicron is a long-form
// blogging platform, so posts federate as Articles (not microblog Notes) and
// carry their title as the object `name`. The id is stable so the same post
// always federates with the same URI. Accepts a post without the internal
// `search_vector` column, which timeline selects omit.
export function buildArticle(
  ctx: Context<unknown>,
  identifier: string,
  post: Omit<Post, "searchVector">,
): Article {
  return new Article({
    id: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    attribution: ctx.getActorUri(identifier),
    name: post.title ?? undefined,
    content: post.contentHtml,
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
    url: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
  });
}
