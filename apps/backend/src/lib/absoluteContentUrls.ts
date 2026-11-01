// SPDX-License-Identifier: AGPL-3.0-or-later
import { load } from "cheerio";

// Stored, sanitized HTML needs the publisher's URL context outside its own page.
export function absoluteContentUrls(html: string, base: URL): string {
  const $ = load(html, {}, false);
  let changed = false;
  for (const [selector, attribute] of [
    ["a[href]", "href"],
    ["img[src]", "src"],
  ] as const) {
    $(selector).each((index, element) => {
      const value = $(element).attr(attribute)!;
      if (/^[a-z][a-z\d+.-]*:/i.test(value)) return;
      try {
        const absolute = new URL(value, base);
        if (absolute.protocol !== "https:" && absolute.protocol !== "http:") return;
        $(element).attr(attribute, absolute.href);
        changed = true;
      } catch {
        // Invalid references stay the sanitizer's concern, not a failed delivery.
      }
    });
  }
  return changed ? $.html() : html;
}
