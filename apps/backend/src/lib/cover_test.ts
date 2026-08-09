// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals, assertThrows } from "@std/assert";
import { absoluteBanner, bannerOf, firstBodyImage, normalizeCoverUrl } from "@/lib/cover.ts";

// A banner is rendered as an image `src`, published as an Open Graph tag and
// federated as the Article `image` — three places an unvalidated URL would be
// actively harmful. And the fallback to the body's first image is what most
// posts will actually display, so it has to hold up on real editor output.

Deno.test("firstBodyImage: takes the first image, not a later one", () => {
  const html = '<p>Hi</p><img src="/api/uploads/a.webp" alt="" /><img src="/api/uploads/b.webp" />';
  assertEquals(firstBodyImage(html), "/api/uploads/a.webp");
});

Deno.test("firstBodyImage: finds src after other attributes", () => {
  // The editor's resizable image writes width/class before src.
  assertEquals(
    firstBodyImage('<img class="w-full" width="600" src="https://cdn.test/x.jpg" alt="A cat" />'),
    "https://cdn.test/x.jpg",
  );
});

Deno.test("firstBodyImage: null when the body has no image", () => {
  assertEquals(firstBodyImage("<p>Just words.</p>"), null);
  assertEquals(firstBodyImage('<img alt="broken" />'), null);
});

Deno.test("bannerOf: the chosen cover wins over the body", () => {
  assertEquals(
    bannerOf({ coverUrl: "https://cdn.test/chosen.jpg", contentHtml: '<img src="/body.png" />' }),
    "https://cdn.test/chosen.jpg",
  );
});

Deno.test("bannerOf: falls back to the body's first image, then to nothing", () => {
  assertEquals(bannerOf({ coverUrl: null, contentHtml: '<img src="/body.png" />' }), "/body.png");
  assertEquals(bannerOf({ coverUrl: null, contentHtml: "<p>Words.</p>" }), null);
});

Deno.test("absoluteBanner: resolves an upload path against the instance origin", () => {
  assertEquals(
    absoluteBanner("/api/uploads/a.webp", "https://blog.test"),
    "https://blog.test/api/uploads/a.webp",
  );
  // An already-absolute URL is left where it is — it is on someone else's host.
  assertEquals(
    absoluteBanner("https://images.test/x.jpg", "https://blog.test"),
    "https://images.test/x.jpg",
  );
  assertEquals(absoluteBanner(null, "https://blog.test"), null);
});

Deno.test("normalizeCoverUrl: accepts an upload path and an absolute URL", () => {
  assertEquals(normalizeCoverUrl("/api/uploads/9f-2b.webp"), "/api/uploads/9f-2b.webp");
  assertEquals(
    normalizeCoverUrl("  https://images.unsplash.com/photo-1?w=1600 "),
    "https://images.unsplash.com/photo-1?w=1600",
  );
});

Deno.test("normalizeCoverUrl: empty and null both clear the banner", () => {
  assertEquals(normalizeCoverUrl(null), null);
  assertEquals(normalizeCoverUrl(undefined), null);
  assertEquals(normalizeCoverUrl("   "), null);
});

Deno.test("normalizeCoverUrl: rejects anything that isn't one of the two shapes", () => {
  for (
    const bad of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      // Not an upload: a path traversal, and a path outside the uploads route.
      "/api/uploads/../../etc/passwd",
      "/etc/passwd",
      "//evil.test/x.jpg",
    ]
  ) {
    assertThrows(() => normalizeCoverUrl(bad), Error);
  }
});
