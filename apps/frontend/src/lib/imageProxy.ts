// SPDX-License-Identifier: AGPL-3.0-or-later
// `width` asks the backend for a copy at most that many px wide (it snaps to
// its own set and serves the original when that's already smaller). Only
// uploads and proxied images can be resized; any other source is left as is.
export function imageUrl(input: string | null | undefined, width?: number): string {
  if (!input) return "";
  try {
    const url = new URL(input, "https://local.invalid");
    if (url.protocol === "data:" || url.protocol === "blob:") return input;
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const w = width ? `w=${Math.ceil(width)}` : "";
    if (url.origin === "https://local.invalid") {
      if (!w || !url.pathname.startsWith("/api/uploads/") || url.search) return input;
      return `${input}?${w}`;
    }
    return `/api/media/proxy?url=${encodeURIComponent(url.href)}${w ? `&${w}` : ""}`;
  } catch {
    return "";
  }
}

/** A `srcset` of `input` at each width, or "" when it can't be resized. */
export function imageSrcset(input: string | null | undefined, widths: readonly number[]): string {
  const sources = widths.map((w) => [imageUrl(input, w), w] as const);
  // Nothing to choose between when every width is the same URL (a data: or
  // non-upload source).
  if (!sources[0]?.[0] || new Set(sources.map(([u]) => u)).size < widths.length) return "";
  return sources.map(([u, w]) => `${u} ${w}w`).join(", ");
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Only sanitizer-normalised HTML: quoted attributes with encoded delimiters.
export function proxyImageHtml(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/(\ssrc=")([^"]*)"/i, (_attr, prefix: string, src: string) => {
      const safe = imageUrl(decodeAttribute(src))
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `${prefix}${safe}"`;
    }),
  );
}
