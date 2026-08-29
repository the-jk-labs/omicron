// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
import { Article, Hashtag, Image, LanguageString, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import { origin } from "@/config.ts";
import type { TagSummary } from "@/db/repositories/tags.ts";
import type { Post } from "@/db/schema.ts";
import { absoluteBanner, bannerOf } from "@/lib/cover.ts";
import { normalizeLanguage } from "@/lib/languages.ts";

// The post's banner as an ActivityPub Image.
//
// A banner uploaded here is stored root-relative (`/api/uploads/…`), which a
// receiving instance would resolve against its own host, so it is absolutized
// against ours first. Anything still unparseable is dropped rather than
// federated as a broken attachment.
function coverImage(url: string | null): Image | undefined {
  const absolute = absoluteBanner(url, origin);
  if (!absolute) return undefined;
  try {
    return new Image({ url: new URL(absolute) });
  } catch {
    return undefined;
  }
}

// The recipients a built Article addresses, matching the wrapping activity that
// carries it. A private author's Article passes `{ to: <Followers> }` and omits
// the Public collection entirely; a public author passes the followers as `cc`.
export type ArticleAudience = {
  to: URL;
  cc?: URL;
};

// A remote object's audience, as exposed by Fedify's `Object` (the synchronous
// `*Ids` accessors — avoids the async getters that would force a refetch).
type AddressedLike = {
  toIds: URL[];
  ccIds: URL[];
  audienceIds: URL[];
};

// True when an ActivityPub object is addressed to the ActivityStreams Public
// collection, which ActivityPub defines as making it accessible without
// authentication. Public appears in `to` or `cc` in every mainstream
// implementation (`audience` is the rare third place some put it); `bcc` is
// deliberately excluded — it is a hidden copy that must never be read as
// publicity. Gates whether we cache a remote Article (#123): a followers-only
// or direct message must not be persisted and then surfaced on every anonymous
// read path.
export function isPubliclyAddressed(obj: AddressedLike): boolean {
  return [obj.toIds, obj.ccIds, obj.audienceIds].some((ids) => ids.some((u) => u.href === PUBLIC_COLLECTION.href));
}

// Builds the ActivityPub Article for a local post. Omicron is a long-form
// blogging platform, so posts federate as Articles (not microblog Notes) and
// carry their title as the object `name`. The id is stable so the same post
// always federates with the same URI. Tags are attached as Hashtag objects on
// the `tag` property (matching Mastodon), each linking to this instance's tag
// page. A `summary` (short preview) and `image` (banner) ride along when the
// post carries them — both are what a receiving instance renders in a link
// card, so a post ingested with a description and a banner looks the same on
// Mastodon as it does here. The banner is the resolved one — the author's
// chosen cover, or the body's first image standing in for it (lib/cover.ts) —
// so a post that never had a cover set still federates with a picture. Accepts
// a post without the internal `search_vector` column, which timeline selects
// omit.
//
// The Article's recipients always mirror the wrapping activity so a receiving
// instance never sees mismatched addressing (ActivityPub warns that mismatched
// addressing "is likely to cause confusion"). By default a public author's
// Article declares `to: Public, cc: followers`; pass `audience` to override,
// as the outbound delivery path does for a private author (whose Article is
// addressed only to the followers collection, with Public omitted entirely).
export function buildArticle(
  ctx: Context<unknown>,
  identifier: string,
  post: Omit<Post, "searchVector">,
  tags: TagSummary[] = [],
  audience?: ArticleAudience,
): Article {
  const { to, cc } = audience ?? {
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
  };
  return new Article({
    id: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    attribution: ctx.getActorUri(identifier),
    name: post.title ?? undefined,
    summary: post.summary ?? undefined,
    image: coverImage(bannerOf(post)),
    // When the author declared a language, tag the content with it (rdf:langString)
    // so remote instances can language-filter it; otherwise send a plain string.
    content: post.language ? new LanguageString(post.contentHtml, post.language) : post.contentHtml,
    to,
    cc,
    url: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    tags: tags.map((t) => new Hashtag({ name: `#${t.name}`, href: new URL(`/tags/${t.slug}`, origin) })),
  });
}

// Extracts the language a remote Article's content is tagged with (rdf:langString),
// normalized to a bare primary subtag, or null when it carries no language tag.
export function articleLanguage(article: Article): string | null {
  const content = article.content;
  return content instanceof LanguageString ? normalizeLanguage(content.locale.language) : null;
}
