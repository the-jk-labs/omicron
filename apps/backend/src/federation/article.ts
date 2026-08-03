// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import { Article, Hashtag, Image, LanguageString, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import { origin } from "@/config.ts";
import type { Post } from "@/db/schema.ts";
import type { TagSummary } from "@/db/repositories/tags.ts";
import { normalizeLanguage } from "@/lib/languages.ts";

// A cover is stored as an absolute URL the sender hosts; anything unparseable
// is dropped rather than federated as a broken attachment.
function coverImage(url: string | null): Image | undefined {
  if (!url) return undefined;
  try {
    return new Image({ url: new URL(url) });
  } catch {
    return undefined;
  }
}

// Builds the ActivityPub Article for a local post. Omicron is a long-form
// blogging platform, so posts federate as Articles (not microblog Notes) and
// carry their title as the object `name`. The id is stable so the same post
// always federates with the same URI. Tags are attached as Hashtag objects on
// the `tag` property (matching Mastodon), each linking to this instance's tag
// page. A `summary` (short preview) and `image` (banner) ride along when the
// post carries them — both are what a receiving instance renders in a link
// card, so a post ingested with a description and a banner looks the same on
// Mastodon as it does here. Accepts a post without the internal `search_vector`
// column, which timeline selects omit.
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
    summary: post.summary ?? undefined,
    image: coverImage(post.coverUrl),
    // When the author declared a language, tag the content with it (rdf:langString)
    // so remote instances can language-filter it; otherwise send a plain string.
    content: post.language ? new LanguageString(post.contentHtml, post.language) : post.contentHtml,
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
    url: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    tags: tags.map((t) =>
      new Hashtag({ name: `#${t.name}`, href: new URL(`/tags/${t.slug}`, origin) })
    ),
  });
}

// Extracts the language a remote Article's content is tagged with (rdf:langString),
// normalized to a bare primary subtag, or null when it carries no language tag.
export function articleLanguage(article: Article): string | null {
  const content = article.content;
  return content instanceof LanguageString ? normalizeLanguage(content.locale.language) : null;
}
