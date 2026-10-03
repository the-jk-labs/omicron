// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { deferBodyImages } from "#lib/bodyImages.js";

test("adds lazy loading and async decoding to every image, before the self-closing slash", () => {
  expect(deferBodyImages('<p>a</p><img src="/a.png" alt="A" /><img src="/b.png">')).toBe(
    '<p>a</p><img src="/a.png" alt="A" loading="lazy" decoding="async" /><img src="/b.png" loading="lazy" decoding="async" />',
  );
});

test("an author's explicit choice wins", () => {
  expect(deferBodyImages('<img src="/a.png" loading="eager" decoding="sync">')).toBe(
    '<img src="/a.png" loading="eager" decoding="sync" />',
  );
  // Attribute names match case-insensitively. (The tag itself is always the
  // sanitizer's lowercase `<img`.)
  expect(deferBodyImages('<img SRC="/a.png" LOADING="eager">')).toBe(
    '<img SRC="/a.png" LOADING="eager" decoding="async" />',
  );
});

test("leaves image-free HTML, and look-alike tags, untouched", () => {
  const html = "<p>No <imgx> here</p>";
  expect(deferBodyImages(html)).toBe(html);
  expect(deferBodyImages("<p>text</p>")).toBe("<p>text</p>");
});
