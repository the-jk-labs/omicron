// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { uploadFilenameFromUrl, uploadFilenamesInText } from "@/lib/uploads.ts";

// The GC decides what to delete from what these helpers accept as a
// reference. A false positive reaps a file still in use; a false negative
// only delays a deletion. Both directions are pinned here.

test("uploadFilenameFromUrl: accepts every stored raster extension", () => {
  for (const [url, expected] of [
    ["/api/uploads/9f2b81ce-4a5d-4c1e-9f3a-2b7d8e6c1a01.png", "9f2b81ce-4a5d-4c1e-9f3a-2b7d8e6c1a01.png"],
    ["/api/uploads/abc.jpg", "abc.jpg"],
    ["/api/uploads/abc.jpeg", "abc.jpeg"],
    ["/api/uploads/abc.webp", "abc.webp"],
    ["/api/uploads/abc.gif", "abc.gif"],
  ] as const) {
    expect(uploadFilenameFromUrl(url)).toBe(expected);
  }
  // Padded by whitespace the way a stored setting might be hand-edited.
  expect(uploadFilenameFromUrl("  /api/uploads/abc.png  ")).toBe("abc.png");
});

test("uploadFilenameFromUrl: rejects everything that is not a stored upload", () => {
  // Someone else's host, or an absolute form of ours — references to uploads
  // are always stored root-relative.
  expect(uploadFilenameFromUrl("https://images.test/x.jpg")).toBeNull();
  expect(uploadFilenameFromUrl("https://blog.test/api/uploads/abc.png")).toBeNull();
  // The derived share image is not the stored file.
  expect(uploadFilenameFromUrl("/api/uploads/og/abc.jpg")).toBeNull();
  // Path traversal and stray text must never read as a filename.
  expect(uploadFilenameFromUrl("/api/uploads/../../etc/passwd")).toBeNull();
  expect(uploadFilenameFromUrl("/api/uploads/abc.png?w=100")).toBeNull();
  expect(uploadFilenameFromUrl("/api/uploads/abc.svg")).toBeNull();
  expect(uploadFilenameFromUrl("")).toBeNull();
  expect(uploadFilenameFromUrl(null)).toBeNull();
});

test("uploadFilenamesInText: finds every upload in rendered body HTML", () => {
  const html =
    '<p>Hi</p><img src="/api/uploads/a.webp" alt="" /><img src="/api/uploads/b.jpg" />' +
    '<img src="/api/uploads/og/a.jpg"><img src="https://elsewhere.test/c.png">';
  expect(uploadFilenamesInText(html)).toEqual(["a.webp", "b.jpg"]);
});

test("uploadFilenamesInText: deduplicates and tolerates empty input", () => {
  expect(uploadFilenamesInText('<img src="/api/uploads/a.png"><img src="/api/uploads/a.png">')).toEqual(["a.png"]);
  expect(uploadFilenamesInText("<p>no images here</p>")).toEqual([]);
  expect(uploadFilenamesInText("")).toEqual([]);
  expect(uploadFilenamesInText(null)).toEqual([]);
});
