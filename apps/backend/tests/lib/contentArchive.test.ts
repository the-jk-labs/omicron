// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ContentArchivePost } from "@omicron/contract";
import { strToU8, zipSync } from "fflate";
import { describe, expect, test } from "vitest";
import {
  bundledImage,
  importKey,
  MAX_ARCHIVE_BYTES,
  parseArchive,
  readZip,
  rewriteImages,
} from "@/lib/contentArchive.ts";

export function archivedPost(overrides: Partial<ContentArchivePost> = {}): ContentArchivePost {
  return {
    key: "https://old.example/posts/p1",
    title: "A story",
    contentHtml: "<p>Hello</p>",
    status: "published",
    createdAt: "2024-01-02T03:04:05.000Z",
    updatedAt: "2024-02-03T00:00:00.000Z",
    tags: ["writing"],
    language: "en",
    summary: "A description",
    coverUrl: null,
    coverCredit: null,
    aiAssisted: true,
    protected: false,
    ...overrides,
  };
}

export function nativeZip(posts = [archivedPost()], files: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    "omicron.json": strToU8(
      JSON.stringify({ format: "omicron", version: 1, exportedAt: "2026-01-01T00:00:00Z", posts }),
    ),
    ...files,
  });
}

test("reads a native archive, preserving dates and metadata while sanitizing HTML", () => {
  const archive = parseArchive(
    nativeZip([archivedPost({ contentHtml: '<p onclick="bad()">Hi</p><script>bad()</script>' })]),
  );
  expect(archive.format).toBe("omicron");
  expect(archive.posts[0]).toMatchObject({
    key: importKey("https://old.example/posts/p1"),
    createdAt: "2024-01-02T03:04:05.000Z",
    updatedAt: "2024-02-03T00:00:00.000Z",
    contentHtml: "<p>Hi</p>",
    tags: ["writing"],
    aiAssisted: true,
  });
  expect(importKey(archive.posts[0].key)).toBe(archive.posts[0].key);
});

test("reads Medium's microformat HTML, not its unrelated account files", () => {
  const archive = parseArchive(
    zipSync({
      "export/posts/2024-story.html": strToU8(
        '<article class="h-entry"><h1 class="p-name">A &amp; B</h1><section class="e-content"><p>Body</p></section><time class="dt-published" datetime="2024-05-06T00:00:00Z"></time><a class="u-url" href="https://medium.com/@ada/story-123">Original</a><a class="p-category">Writing</a></article>',
      ),
      "export/posts/draft-another.html": strToU8(
        '<h1 class="p-name">Draft</h1><div class="e-content"><p>Unfinished</p></div>',
      ),
      "export/profile.html": strToU8("Private account data"),
    }),
  );
  expect(archive.format).toBe("medium");
  expect(archive.posts).toHaveLength(2);
  expect(archive.posts[0]).toMatchObject({
    title: "A & B",
    status: "published",
    contentHtml: "<p>Body</p>",
    tags: ["writing"],
  });
  expect(archive.posts[1]).toMatchObject({ status: "draft" });
  expect(archive.posts[1].warnings.join(" ")).toContain("No valid date");
});

test("joins quoted Substack CSV rows to HTML by post_id and protects paid content", () => {
  const archive = parseArchive(
    zipSync({
      "backup/posts.csv": strToU8(
        'post_id,post_date,is_published,audience,title,subtitle\n123.first,2023-06-01T12:00:00Z,true,everyone,"Hello, world","A subtitle"\n456.second,2023-06-02T00:00:00Z,true,only_paid,Paid,\n',
      ),
      "backup/posts/123.first.html": strToU8("<p>Free body</p>"),
      "backup/posts/456.second.html": strToU8("<p>Paid body</p>"),
      "backup/subscribers.csv": strToU8("Private subscriber emails"),
    }),
  );
  expect(archive.format).toBe("substack");
  expect(archive.posts[0]).toMatchObject({ title: "Hello, world", summary: "A subtitle", protected: false });
  expect(archive.posts[1]).toMatchObject({ protected: true });
  expect(archive.posts[1].warnings.join(" ")).toContain("Restricted content");
});

test("missing Substack bodies fail rather than silently dropping posts", () => {
  expect(() => parseArchive(zipSync({ "posts.csv": strToU8("post_id,title\n1.missing,Missing\n") }))).toThrow(
    "missing posts/1.missing.html",
  );
});

test("reads WordPress WXR, ignores attachments, and preserves drafts and tags", () => {
  const archive = parseArchive(
    strToU8(`<rss xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><wp:wxr_version>1.2</wp:wxr_version>
  <item><title>WordPress</title><guid>wp:1</guid><wp:post_type>post</wp:post_type><wp:status>draft</wp:status><wp:post_date_gmt>2022-03-04 00:00:00</wp:post_date_gmt><content:encoded><![CDATA[<p>Body</p>]]></content:encoded><category>Tech</category></item>
  <item><wp:post_type>attachment</wp:post_type></item></channel></rss>`),
  );
  expect(archive.format).toBe("wordpress");
  expect(archive.posts).toHaveLength(1);
  expect(archive.posts[0]).toMatchObject({
    title: "WordPress",
    status: "draft",
    tags: ["tech"],
    createdAt: "2022-03-04T00:00:00.000Z",
  });
});

test("accepts ordinary RSS feeds with encoded HTML", () => {
  const archive = parseArchive(
    strToU8(
      "<rss><channel><item><title>RSS</title><link>https://blog.test/post</link><pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate><description>&lt;p&gt;Hello&lt;/p&gt;</description></item></channel></rss>",
    ),
  );
  expect(archive.format).toBe("rss");
  expect(archive.posts[0].contentHtml).toBe("<p>Hello</p>");
});

test("resolves only bundled images, including wrapped archives, and rewrites parsed attributes", () => {
  const archive = parseArchive(
    nativeZip([archivedPost({ contentHtml: '<p><img src="media/one.png" alt="A &amp; B"></p>' })], {
      "media/one.png": new Uint8Array([1]),
    }),
  );
  expect(bundledImage(archive, archive.posts[0], "media/one.png")).toBe("media/one.png");
  expect(bundledImage(archive, archive.posts[0], "../../etc/passwd")).toBeNull();
  expect(bundledImage(archive, archive.posts[0], "https://internal.test/media/one.png")).toBeNull();
  expect(rewriteImages(archive.posts[0].contentHtml, new Map([["media/one.png", "/api/uploads/new.png"]]))).toContain(
    'src="/api/uploads/new.png"',
  );
});

test("warns about schedules, excessive tags, and invalid dates", () => {
  const post = parseArchive(
    nativeZip([archivedPost({ status: "scheduled", createdAt: "bad", tags: ["a", "b", "c", "d", "e", "f"] })]),
  ).posts[0];
  expect(post.tags).toHaveLength(5);
  expect(post.warnings.join(" ")).toMatch(/No valid date.*first five tags.*Scheduled posts/);
});

describe("untrusted archives", () => {
  test("rejects unsafe paths without extracting anything to disk", () => {
    for (const name of ["../escape", "/absolute", "a\\b", "a/../../escape"]) {
      expect(() => readZip(zipSync({ [name]: strToU8("no") }))).toThrow("unsafe");
    }
  });
  test("rejects oversized files before decompression", () => {
    expect(() => readZip(zipSync({ "huge.txt": new Uint8Array(10 * 1024 * 1024 + 1) }))).toThrow("10 MB");
  });
  test("enforces actual decompressed sizes even when headers lie", () => {
    const zip = zipSync({ "huge.txt": new Uint8Array(10 * 1024 * 1024 + 1) });
    new DataView(zip.buffer).setUint32(22, 1, true);
    expect(() => readZip(zip)).toThrow("expanded archive");
  });
  test("rejects missing, unsupported, oversized, duplicate, and empty-content manifests", () => {
    expect(() => parseArchive(new Uint8Array())).toThrow("50 MB");
    expect(() => parseArchive(new Uint8Array(MAX_ARCHIVE_BYTES + 1))).toThrow("50 MB");
    expect(() => parseArchive(zipSync({ "omicron.json": strToU8('{"format":"omicron","version":99}') }))).toThrow(
      "not supported",
    );
    expect(() => parseArchive(nativeZip([archivedPost(), archivedPost()]))).toThrow("duplicate post identities");
    expect(() => parseArchive(nativeZip([archivedPost({ contentHtml: "<script>bad()</script>" })]))).toThrow(
      "no supported content",
    );
    expect(() => parseArchive(nativeZip([]))).toThrow("No supported posts");
    expect(() => parseArchive(strToU8("not an export"))).toThrow("RSS feed");
    expect(() =>
      parseArchive(nativeZip(Array.from({ length: 1001 }, (_, i) => archivedPost({ key: `p${i}` })))),
    ).toThrow("1,000 posts");
  });
});
