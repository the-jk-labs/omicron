// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared pieces for the sitemap routes.
//
// The sitemap is split across several files behind an index, rather than being
// one document, because the spec caps a single file at 50,000 URLs and an
// instance that outgrows that would otherwise just stop advertising the
// overflow — silently, with the posts that fell off the end simply never
// appearing in search. Splitting also means an engine re-fetches only the file
// whose lastmod moved, instead of the whole archive every time one post is
// edited.

import { escapeXml } from "$lib/xml";

// `<lastmod>` wants a date, and the value reaching us is whatever the API
// serialized. A malformed one must not become "Invalid Date" in the output — an
// engine rejects the whole document over one bad entry — so it is dropped and
// the URL is listed without a lastmod, which is valid.
export function lastmod(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** The newest of a set of dates, as a `<lastmod>` — an index file's own date. */
export function newest(values: (string | null | undefined)[]): string | null {
  const times = values
    .map((v) => (v ? new Date(v).getTime() : Number.NaN))
    .filter((t) => !Number.isNaN(t));
  return times.length ? lastmod(new Date(Math.max(...times)).toISOString()) : null;
}

export type SitemapUrl = { loc: string; lastmod?: string | null };

function entry(tag: "url" | "sitemap", { loc, lastmod: mod }: SitemapUrl): string {
  const line = mod ? `\n    <lastmod>${mod}</lastmod>` : "";
  return `  <${tag}>\n    <loc>${escapeXml(loc)}</loc>${line}\n  </${tag}>`;
}

function document(root: "urlset" | "sitemapindex", tag: "url" | "sitemap", items: SitemapUrl[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${items.map((i) => entry(tag, i)).join("\n")}\n</${root}>\n`;
}

export function urlsetResponse(urls: SitemapUrl[]): Response {
  return xmlResponse(document("urlset", "url", urls));
}

export function sitemapIndexResponse(sitemaps: SitemapUrl[]): Response {
  return xmlResponse(document("sitemapindex", "sitemap", sitemaps));
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
