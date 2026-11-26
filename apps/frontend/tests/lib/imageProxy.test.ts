// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { imageSrcset, imageUrl, proxyImageHtml } from "#lib/imageProxy.js";

test("remote sources are same-origin, while local uploads and previews stay unchanged", () => {
  expect(imageUrl("http://images.example/a.png?x=1&y=2")).toBe(
    "/api/media/proxy?url=http%3A%2F%2Fimages.example%2Fa.png%3Fx%3D1%26y%3D2",
  );
  expect(imageUrl("//images.example/a.png")).toContain("url=https%3A%2F%2Fimages.example");
  for (const src of [
    "/api/uploads/a.png",
    "./local.png",
    "blob:https://blog.example/id",
    "data:image/png;base64,AA==",
  ]) {
    expect(imageUrl(src)).toBe(src);
  }
  for (const src of ["javascript:alert(1)", "file:///etc/passwd", null, undefined]) expect(imageUrl(src)).toBe("");
});

test("sanitised HTML sources are decoded once and escaped again without touching text or links", () => {
  const html =
    '<p>&lt;img src="example"&gt;</p><a href="https://images.example/a">link</a><img alt="x" src="https://images.example/a?x=1&amp;y=2" /><img src="/api/uploads/local.png" />';
  const out = proxyImageHtml(html);
  expect(out).toContain('src="/api/media/proxy?url=https%3A%2F%2Fimages.example%2Fa%3Fx%3D1%26y%3D2"');
  expect(out).toContain('<img src="/api/uploads/local.png" />');
  expect(out).toContain('<p>&lt;img src="example"&gt;</p>');
  expect(out).toContain('<a href="https://images.example/a">link</a>');
  expect(proxyImageHtml(out)).toBe(out);
});

test("a width asks uploads and proxied images for a smaller copy, and leaves anything else alone", () => {
  expect(imageUrl("/api/uploads/a.webp", 288)).toBe("/api/uploads/a.webp?w=288");
  expect(imageUrl("https://images.example/a.png", 80)).toBe(
    "/api/media/proxy?url=https%3A%2F%2Fimages.example%2Fa.png&w=80",
  );
  // Fractional CSS sizes round up rather than ask for a blurrier copy.
  expect(imageUrl("/api/uploads/a.webp", 79.2)).toBe("/api/uploads/a.webp?w=80");
  for (const src of [
    "./local.png",
    "/favicon.png",
    "/api/uploads/a.webp?v=2",
    "data:image/png;base64,AA==",
    "blob:x",
  ]) {
    expect(imageUrl(src, 256)).toBe(src);
  }
  expect(imageUrl("/api/uploads/a.webp", 0)).toBe("/api/uploads/a.webp");
  expect(imageUrl("javascript:alert(1)", 256)).toBe("");
});

test("a srcset lists one copy per width, and none for a source that can't be resized", () => {
  expect(imageSrcset("/api/uploads/a.webp", [640, 1280])).toBe(
    "/api/uploads/a.webp?w=640 640w, /api/uploads/a.webp?w=1280 1280w",
  );
  expect(imageSrcset("data:image/png;base64,AA==", [640, 1280])).toBe("");
  expect(imageSrcset(null, [640, 1280])).toBe("");
});
