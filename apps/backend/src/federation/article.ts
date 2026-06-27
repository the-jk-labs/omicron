// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import { Article, Hashtag, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import { origin } from "@/config.ts";
import type { Post } from "@/db/schema.ts";
import type { TagSummary } from "@/db/repositories/tags.ts";

// Builds the ActivityPub Article for a local post. Omicron is a long-form
// blogging platform, so posts federate as Articles (not microblog Notes) and
// carry their title as the object `name`. The id is stable so the same post
// always federates with the same URI. Tags are attached as Hashtag objects on
// the `tag` property (matching Mastodon), each linking to this instance's tag
// page. Accepts a post without the internal `search_vector` column, which
// timeline selects omit.
export function buildArticle(
  ctx: Context<unknown>,
  identifier: string,
  post: Omit<Post, "searchVector">,
  tags: TagSummary[] = [],
): Article {
  return new Article({
    id: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    attribution: ctx.getActorUri(identifier),
    name: post.title ?? undefined,
    content: post.contentHtml,
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
    url: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    tags: tags.map((t) =>
      new Hashtag({ name: `#${t.name}`, href: new URL(`/tags/${t.slug}`, origin) })
    ),
  });
}
