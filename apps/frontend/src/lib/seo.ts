// SPDX-License-Identifier: AGPL-3.0-or-later
// Schema.org structured data (JSON-LD) for the pages worth describing.
//
// The Open Graph tags in the layout say what a *link preview* should look like.
// This says what the page *is*: an article, with an author, a date, a language
// and a subject — in the vocabulary search engines actually parse. Without it a
// blog post is indistinguishable from any other page of text, which is the
// difference between a bare blue link and a result carrying the author's name,
// the date and a thumbnail. It is also what feeds Google Discover and what the
// AI crawlers read in preference to guessing at the markup.
//
// Only three page kinds are described, because only three have a subject that
// schema.org has a real type for: a post, a profile, and the site itself. A
// feed or a tag listing is a list of links to those, and annotating it adds
// nothing an engine cannot already see.

import type { InstanceInfo, Post, Profile } from "$lib/types";

// Serialize for embedding inside <script type="application/ld+json">.
//
// The content here is not ours: a federated post's title and its author's
// display name arrive from another instance. Inside a <script> element the
// parser is looking for `</script`, not for JSON syntax, so a title containing
// one would end the block early and drop everything after it into the document
// as markup. Escaping `<` (and `&`, which could otherwise reconstitute one
// through an entity) to its \u form removes the sequence entirely while parsing
// back to exactly the same string. U+2028/2029 are legal in JSON strings but
// terminate a line in JavaScript, so they go too.
const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c]);
}

// BCP-47 shape, matching the check in hooks.server.ts — same untrusted origin,
// same reason to state the accepted shape rather than pass anything through.
const BCP47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

function language(tag: string | null | undefined): string | undefined {
  const t = tag?.trim();
  return t && BCP47.test(t) ? t : undefined;
}

// A remote image URL is only usable if it is absolute — a relative one would
// resolve against the crawler, not us. Mirrors the layout's share-image rule.
function absolute(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

// Drop keys whose value is undefined, so an absent cover image or language
// leaves no empty property behind for a validator to complain about.
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

type SiteContext = {
  origin: string;
  appName: string;
  instance?: InstanceInfo | null;
};

// The instance as the publisher of its local posts. Not a claim about the
// fediverse at large — just "this site published this article", which is what
// `publisher` means and what an engine needs to attribute the piece.
function publisher({ origin, appName }: SiteContext) {
  return {
    "@type": "Organization",
    name: appName,
    url: origin,
    logo: { "@type": "ImageObject", url: `${origin}/icon-512.png` },
  };
}

/**
 * A locally-authored post.
 *
 * Never called for a federated one: those pages are `noindex` (they reproduce
 * an article published elsewhere), and describing content we have just
 * disclaimed authorship of would be contradictory.
 */
export function blogPostingLd(
  post: Post,
  {
    canonical,
    description,
    image,
    site,
  }: {
    canonical: string;
    description: string;
    image?: string;
    site: SiteContext;
  },
) {
  return compact({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title ?? undefined,
    description: description || undefined,
    // The URL an engine should treat as this article's home, matching the
    // <link rel="canonical"> the layout emits alongside.
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    url: canonical,
    datePublished: post.createdAt,
    // Only when it differs from publication: `dateModified` equal to
    // `datePublished` on every article is noise, and on a post nobody has
    // edited it would be asserting an edit that never happened. Absent on a
    // post ingested before the column existed, which is correct — we do not
    // know when it last changed.
    dateModified: post.updatedAt && post.updatedAt !== post.createdAt ? post.updatedAt : undefined,
    inLanguage: language(post.language),
    image: absolute(image),
    keywords: post.tags?.length ? post.tags.map((t) => t.name).join(", ") : undefined,
    author: {
      "@type": "Person",
      name: post.author.displayName,
      url: `${site.origin}/@${post.author.username}`,
    },
    publisher: publisher(site),
  });
}

/**
 * The trail from the site root to a post: instance → author → article.
 *
 * Search results render this in place of the raw URL, so a reader sees who
 * wrote a piece before deciding to click rather than a slug ending in eight hex
 * characters. Returned as a second document rather than nested in the
 * BlogPosting because a breadcrumb describes the *page's position*, not the
 * article — and the two are emitted as an array so a page can carry both.
 */
export function breadcrumbLd(post: Post, { canonical, site }: { canonical: string; site: SiteContext }) {
  const crumbs = [
    { name: site.appName, item: site.origin },
    { name: post.author.displayName, item: `${site.origin}/@${post.author.username}` },
    // The last crumb is the page itself: named, but with no `item`, which is
    // schema.org's way of saying "you are here" rather than offering a link to
    // where the reader already is.
    { name: post.title ?? "Post", item: undefined },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) =>
      compact({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: c.item ?? (i === crumbs.length - 1 ? canonical : undefined),
      }),
    ),
  };
}

/** A local author's profile page. */
export function profilePageLd(profile: Profile, { canonical, site }: { canonical: string; site: SiteContext }) {
  const u = profile.user;
  return compact({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: canonical,
    mainEntity: compact({
      "@type": "Person",
      name: u.displayName,
      // The fediverse handle, which is how this person is addressed anywhere
      // outside this instance.
      alternateName: `@${u.username}@${new URL(site.origin).host}`,
      description: u.bio || undefined,
      image: absolute(u.avatarUrl),
      url: canonical,
      // Profile links the author chose to feature (their site, their code
      // host). `sameAs` is schema.org's "the same person, elsewhere", which is
      // exactly what these are.
      sameAs: u.links?.length ? u.links.map((l) => l.url) : undefined,
    }),
  });
}

/**
 * The instance itself, on the home page.
 *
 * Carries no SearchAction: that markup offers an engine a search URL to expose
 * as a sitelinks box, and robots.txt disallows /search precisely so crawlers
 * stay out of it. Advertising a URL we have asked them not to fetch would be
 * incoherent.
 */
export function webSiteLd({ description, site }: { description: string; site: SiteContext }) {
  return compact({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.appName,
    url: site.origin,
    description: description || undefined,
    publisher: publisher(site),
  });
}
