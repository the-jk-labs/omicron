// SPDX-License-Identifier: AGPL-3.0-or-later
export function imageUrl(input: string | null | undefined): string {
  if (!input) return "";
  try {
    const url = new URL(input, "https://local.invalid");
    if (url.protocol === "data:" || url.protocol === "blob:") return input;
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (url.origin === "https://local.invalid") return input;
    return `/api/media/proxy?url=${encodeURIComponent(url.href)}`;
  } catch {
    return "";
  }
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
