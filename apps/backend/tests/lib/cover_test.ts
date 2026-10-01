// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { absoluteBanner, bannerOf, firstBodyImage, normalizeCoverCredit, normalizeCoverUrl } from "@/lib/cover.ts";

// A banner is rendered as an image `src`, published as an Open Graph tag and
// federated as the Article `image` — three places an unvalidated URL would be
// actively harmful. And the fallback to the body's first image is what most
// posts will actually display, so it has to hold up on real editor output.

test("firstBodyImage: takes the first image, not a later one", () => {
  const html = '<p>Hi</p><img src="/api/uploads/a.webp" alt="" /><img src="/api/uploads/b.webp" />';
  expect(firstBodyImage(html)).toBe("/api/uploads/a.webp");
});

test("firstBodyImage: finds src after other attributes", () => {
  // The editor's resizable image writes width/class before src.
  expect(firstBodyImage('<img class="w-full" width="600" src="https://cdn.test/x.jpg" alt="A cat" />')).toBe(
    "https://cdn.test/x.jpg",
  );
});

test("firstBodyImage: null when the body has no image", () => {
  expect(firstBodyImage("<p>Just words.</p>")).toBe(null);
  expect(firstBodyImage('<img alt="broken" />')).toBe(null);
});

test("bannerOf: the chosen cover wins over the body", () => {
  expect(bannerOf({ coverUrl: "https://cdn.test/chosen.jpg", contentHtml: '<img src="/body.png" />' })).toBe(
    "https://cdn.test/chosen.jpg",
  );
});

test("bannerOf: falls back to the body's first image, then to nothing", () => {
  expect(bannerOf({ coverUrl: null, contentHtml: '<img src="/body.png" />' })).toBe("/body.png");
  expect(bannerOf({ coverUrl: null, contentHtml: "<p>Words.</p>" })).toBe(null);
});

test("absoluteBanner: resolves an upload path against the instance origin", () => {
  expect(absoluteBanner("/api/uploads/a.webp", "https://blog.test")).toBe("https://blog.test/api/uploads/a.webp");
  // An already-absolute URL is left where it is — it is on someone else's host.
  expect(absoluteBanner("https://images.test/x.jpg", "https://blog.test")).toBe("https://images.test/x.jpg");
  expect(absoluteBanner(null, "https://blog.test")).toBe(null);
});

test("normalizeCoverUrl: accepts an upload path and an absolute URL", () => {
  expect(normalizeCoverUrl("/api/uploads/9f-2b.webp")).toBe("/api/uploads/9f-2b.webp");
  expect(normalizeCoverUrl("  https://images.unsplash.com/photo-1?w=1600 ")).toBe(
    "https://images.unsplash.com/photo-1?w=1600",
  );
});

test("normalizeCoverUrl: empty and null both clear the banner", () => {
  expect(normalizeCoverUrl(null)).toBe(null);
  expect(normalizeCoverUrl(undefined)).toBe(null);
  expect(normalizeCoverUrl("   ")).toBe(null);
});

test("normalizeCoverUrl: rejects anything that isn't one of the two shapes", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    // Not an upload: a path traversal, and a path outside the uploads route.
    "/api/uploads/../../etc/passwd",
    "/etc/passwd",
    "//evil.test/x.jpg",
  ]) {
    expect(() => normalizeCoverUrl(bad)).toThrow(Error);
  }
});

test("normalizeCoverCredit: keeps a complete credit, drops an empty one", () => {
  expect(
    normalizeCoverCredit({
      name: " Ada Lovelace ",
      nameUrl: "https://unsplash.com/@ada",
      source: "Unsplash",
      sourceUrl: "https://unsplash.com/photos/abc",
    }),
  ).toEqual({
    name: "Ada Lovelace",
    nameUrl: "https://unsplash.com/@ada",
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/photos/abc",
  });
  expect(normalizeCoverCredit(null)).toBe(null);
  expect(normalizeCoverCredit({})).toBe(null);
});

test("normalizeCoverCredit: carries a Creative Commons licence through", () => {
  expect(
    normalizeCoverCredit({
      name: "Marufish",
      nameUrl: "https://www.flickr.com/photos/8819274@N04",
      source: "Flickr",
      sourceUrl: "https://www.flickr.com/photos/8819274@N04/8344491578",
      license: "CC BY-SA 2.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
    })?.license,
  ).toBe("CC BY-SA 2.0");
});

test("normalizeCoverCredit: a partial credit is an error, not a partial credit", () => {
  const full = {
    name: "Ada",
    nameUrl: "https://unsplash.com/@ada",
    source: "Unsplash",
    sourceUrl: "https://unsplash.com/photos/abc",
  };
  // Each required part missing in turn.
  for (const key of ["name", "nameUrl", "source", "sourceUrl"] as const) {
    expect(() => normalizeCoverCredit({ ...full, [key]: "" })).toThrow("creator and a source");
  }
  // A licence without somewhere to read it states terms it cannot show.
  expect(() => normalizeCoverCredit({ ...full, license: "CC BY 2.0" })).toThrow("licence needs both");
  // Every link is an href on the post page, so none of them may be a script URL.
  expect(() => normalizeCoverCredit({ ...full, nameUrl: "javascript:alert(1)" })).toThrow(Error);
  expect(() => normalizeCoverCredit({ ...full, sourceUrl: "/relative" })).toThrow(Error);
});
