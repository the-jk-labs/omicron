// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { imageUrl, proxyImageHtml } from "#lib/imageProxy.js";

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
