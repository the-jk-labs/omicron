// SPDX-License-Identifier: AGPL-3.0-or-later
// RSS 2.0 feeds for writers (/@user/feed.xml) and reading lists
// (/lists/<slug>/feed.xml).
//
// A feed item is a NOTIFICATION, not a copy of the article: it carries the
// post's opening section and a link back to the site, never the full body. So
// the feed tells a reader "this exists, here's the start" and reading happens
// on the instance, where the author's engagement, comments and attribution
// live. `firstSection` below is what enforces that; treat any change to it as a
// change to that promise.
//
// Built here rather than in the backend for the same reason as sitemap.xml: the
// canonical permalink logic lives in $lib/links and the absolute URLs need the
// request's origin.

import { excerpt, stripHtml } from "$lib/format";
import { postPath } from "$lib/links";
import { escapeXml } from "$lib/xml";
import type { Post } from "$lib/types";

// The opening section ends at the post's first heading. A post that has no
// headings (or one long opening section) is capped instead, so a headingless
// 5,000-word essay can never syndicate whole.
const MAX_TEXT_CHARS = 600;

const HEADING_OPEN_RE = /<h[1-6](?:\s[^>]*)?>/gi;
// Closing tags of the block elements a post body is built from — the candidate
// points to cut the HTML without splitting an element in half.
const BLOCK_END_RE = /<\/(?:p|ul|ol|blockquote|table|figure|dl|pre)>/gi;
// Blocks that nest (a <ul> inside an <li>, a <table> inside a <figure>), so
// their closing tag is only a safe cut point when every one of them is closed.
const CONTAINERS = ["ul", "ol", "blockquote", "table", "figure", "dl"];

// Whether `html` closes every container it opens — i.e. cutting here leaves
// well-formed markup rather than a dangling <ul>.
function balanced(html: string): boolean {
  return CONTAINERS.every((tag) => {
    const opens = html.match(new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi"))?.length ?? 0;
    const closes = html.match(new RegExp(`</${tag}>`, "gi"))?.length ?? 0;
    return opens === closes;
  });
}

// Everything before the first heading. Headings that open the post (a title-ish
// <h1> with no prose above it) are skipped, since cutting there would leave an
// empty item.
function cutAtFirstHeading(html: string): string {
  for (const match of html.matchAll(HEADING_OPEN_RE)) {
    const head = html.slice(0, match.index);
    if (stripHtml(head)) return head;
  }
  return html;
}

// Trim to roughly MAX_TEXT_CHARS of text, always on a block boundary so the
// markup stays well-formed. When even the first block is over the cap (one huge
// paragraph), fall back to a plain-text excerpt of it.
function capLength(html: string): string {
  if (stripHtml(html).length <= MAX_TEXT_CHARS) return html;
  let cut = 0;
  for (const match of html.matchAll(BLOCK_END_RE)) {
    const end = match.index + match[0].length;
    const slice = html.slice(0, end);
    if (stripHtml(slice).length > MAX_TEXT_CHARS) break;
    if (balanced(slice)) cut = end;
  }
  return cut ? html.slice(0, cut) : `<p>${excerpt(html, MAX_TEXT_CHARS)}</p>`;
}

/** The article's opening section: up to its first heading, length-capped. */
export function firstSection(html: string): string {
  return capLength(cutAtFirstHeading(html));
}

// Uploaded images are stored as root-relative URLs (/api/uploads/…), which a
// feed reader has no origin to resolve against. Protocol-relative URLs (//host)
// are already absolute and left alone.
function absolutizeUrls(html: string, origin: string): string {
  return html.replace(
    /\b(href|src)="\/(?!\/)([^"]*)"/gi,
    (_match, attr: string, path: string) => `${attr}="${origin}/${path}"`,
  );
}

export type FeedItem = {
  title: string;
  link: string;
  /** ISO timestamp; rendered as RFC 822 in the feed. */
  pubDate: string;
  creator: string;
  descriptionHtml: string;
  categories?: string[];
};

/**
 * One feed item for a post: opening section, then the link back to the site.
 * Remote posts keep an on-instance link (`/@user@host/…` resolves here), so a
 * list feed mixing local and federated stories reads consistently.
 */
export function postFeedItem(post: Post, origin: string): FeedItem {
  const link = `${origin}${postPath(post)}`;
  const opening = absolutizeUrls(firstSection(post.contentHtml), origin);
  return {
    title: post.title || "Untitled",
    link,
    pubDate: post.createdAt,
    creator: post.author.displayName || post.author.username,
    categories: post.tags.map((t) => t.name),
    descriptionHtml: `${opening}\n<p><a href="${link}">Read the full story</a></p>`,
  };
}

function renderItem(item: FeedItem): string {
  const categories = (item.categories ?? [])
    .map((c) => `\n    <category>${escapeXml(c)}</category>`)
    .join("");
  return [
    "  <item>",
    `    <title>${escapeXml(item.title)}</title>`,
    `    <link>${escapeXml(item.link)}</link>`,
    `    <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
    `    <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>`,
    `    <dc:creator>${escapeXml(item.creator)}</dc:creator>${categories}`,
    // The body is HTML inside an XML text node, so it is escaped whole; readers
    // unescape it back to markup. Entities already in the post (&amp;) survive
    // the round trip.
    `    <description>${escapeXml(item.descriptionHtml)}</description>`,
    "  </item>",
  ].join("\n");
}

/** Serialize a channel + its items as an RSS 2.0 document. */
export function renderRssFeed(feed: {
  title: string;
  description: string;
  /** The page this feed mirrors (profile or list). */
  link: string;
  /** This feed's own absolute URL, advertised via atom:link rel=self. */
  feedUrl: string;
  items: FeedItem[];
}): string {
  const items = feed.items.map(renderItem).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>${escapeXml(feed.title)}</title>
  <link>${escapeXml(feed.link)}</link>
  <description>${escapeXml(feed.description)}</description>
  <atom:link href="${escapeXml(feed.feedUrl)}" rel="self" type="application/rss+xml" />
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>
`;
}

/** Response headers shared by both feeds. */
export const FEED_HEADERS = {
  "content-type": "application/rss+xml; charset=utf-8",
  "cache-control": "public, max-age=3600",
};
