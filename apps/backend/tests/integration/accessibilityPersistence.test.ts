// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ContentArchive,
  ContentImportPreview,
  ContentImportResult,
  PostResponse,
  SavedPostResponse,
  UploadedImage,
  type OwnPostStatus,
} from "@omicron/contract";
import { load } from "cheerio";
import { eq } from "drizzle-orm";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { buildApp } from "@/app.ts";
import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as portabilityRepo from "@/db/repositories/contentPortability.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as uploadsRepo from "@/db/repositories/uploads.ts";
import { uploads } from "@/db/schema.ts";
import { importKey } from "@/lib/contentArchive.ts";
import { queue } from "@/queue/queue.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import { saveImage } from "@/services/media.ts";
import { accessibilityContent, expectAccessibleContent } from "../accessibilityContent.ts";
import { closeDb, mkPost, mkRemoteActor, mkRemotePost, mkSession, mkUser, resetDb } from "./harness.ts";

// Single-pixel assets prove byte preservation, not the meaning of their descriptions.
const chart = {
  type: "image/png",
  bytes: new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==",
      "base64",
    ),
  ),
};
const decoration = {
  type: "image/gif",
  bytes: new Uint8Array(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")),
};
const credit = {
  name: "Writer",
  nameUrl: "https://example.test/writer",
  source: "Example",
  sourceUrl: "https://example.test",
};
const originalUploadsDir = config.UPLOADS_DIR;
let root: string;
let origin: string;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "omicron-accessibility-"));
  seedFederationRunning(false);
  app = await buildApp();
});
beforeEach(async () => {
  await resetDb();
  config.UPLOADS_DIR = await mkdtemp(join(root, "case-"));
  origin = await getOrigin();
  // Delivery is a separate test boundary; HTTP, sessions, SQL and files stay real.
  vi.spyOn(queue, "add").mockImplementation(() => {});
});
afterAll(async () => {
  config.UPLOADS_DIR = originalUploadsDir;
  await closeDb();
  if (root) await rm(root, { recursive: true, force: true });
});

async function actor(username: string, isPrivate = false) {
  const user = await mkUser(username, { isPrivate });
  const at = new Date();
  await mkSession(user.id, at);
  const token = `tok-${user.id}-${at.getTime()}`;
  const signature = createHmac("sha256", config.SESSION_SECRET).update(token).digest("base64");
  const cookie = `${(await auth.$context).authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`;
  return { user, cookie };
}
type Actor = Awaited<ReturnType<typeof actor>>;

function request(path: string, cookie = "", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", origin);
  headers.set("dnt", "1");
  return app.request(`${origin}${path}`, { ...init, headers });
}

function json(path: string, cookie: string, body: unknown, method = "POST") {
  return request(path, cookie, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function archiveRequest(action: string, cookie: string, bytes: Uint8Array) {
  return request(`/api/content/${action}`, cookie, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: new Uint8Array(bytes),
  });
}

async function upload(cookie: string, asset: typeof chart) {
  const res = await request("/api/uploads", cookie, {
    method: "POST",
    headers: { "content-type": asset.type },
    body: new Uint8Array(asset.bytes),
  });
  expect(res.status).toBe(201);
  return UploadedImage.parse(await res.json()).url;
}

const filename = (url: string) => url.slice("/api/uploads/".length);
const mediaPath = (url: string) => `media/${filename(url)}`;
const ownUploads = (id: string) => db.select().from(uploads).where(eq(uploads.ownerId, id));
const ownPosts = (id: string) => portabilityRepo.listOwn(id, 100);

function content(graph: string, decorative: string) {
  return accessibilityContent
    .replace("/api/uploads/chart.png", graph)
    .replace("/api/uploads/decoration.png", decorative);
}

function expectFixture(html: string, graph: string, decorative: string) {
  expectAccessibleContent(html, graph);
  const $ = load(html, {}, false);
  expect($('img[alt=""]').attr("src")).toBe(decorative);
  expect($("figure img").attr("width")).toBe("400");
  expect($('a[href="#omicron-content-graph-description"]').text()).toBe("Full graph description");
  for (const attr of ["aria-labelledby", "aria-describedby", "headers"]) {
    $(`[${attr}]`).each((_, el) => {
      for (const id of $(el).attr(attr)!.split(/\s+/)) expect($(`[id="${id}"]`)).toHaveLength(1);
    });
  }
}

async function create(owner: Actor, status: OwnPostStatus = "draft") {
  const graph = await upload(owner.cookie, chart);
  const decorative = await upload(owner.cookie, decoration);
  const html = content(graph, decorative);
  const publishAt = status === "scheduled" ? new Date(Date.now() + 3600_000).toISOString() : null;
  const res = await json("/api/posts", owner.cookie, {
    title: "Accessible report",
    contentHtml: html,
    status,
    publishAt,
    language: "en",
    summary: "An illustrated sales report.",
    coverUrl: graph,
    coverCredit: credit,
    tags: ["accessibility", "reports"],
  });
  expect(res.status).toBe(201);
  const { post } = SavedPostResponse.parse(await res.json());
  expectFixture(post.contentHtml, graph, decorative);
  return { post, html, graph, decorative, publishAt };
}

async function read(id: string, cookie: string) {
  const res = await request(`/api/posts/${id}`, cookie);
  expect(res.status).toBe(200);
  return PostResponse.parse(await res.json()).post;
}

async function exported(cookie: string) {
  const res = await request("/api/content/export", cookie);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/zip");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("content-disposition")).toContain("omicron-content.zip");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const files = unzipSync(bytes);
  const manifest = ContentArchive.parse(JSON.parse(strFromU8(files["omicron.json"])));
  return { bytes, files, manifest };
}

async function preview(cookie: string, bytes: Uint8Array) {
  const res = await archiveRequest("preview", cookie, bytes);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  return ContentImportPreview.parse(await res.json());
}

async function imported(cookie: string, bytes: Uint8Array, preservePublished = false) {
  const res = await archiveRequest(`import?preservePublished=${preservePublished}`, cookie, bytes);
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  return ContentImportResult.parse(await res.json());
}

async function expectStoredImages(owner: Actor, html: string) {
  const $ = load(html, {}, false);
  const graph = $("figure img").attr("src")!;
  const decorative = $('img[alt=""]').attr("src")!;
  expectFixture(html, graph, decorative);
  const rows = await ownUploads(owner.user.id);
  expect(rows).toHaveLength(2);
  for (const [url, asset] of [
    [graph, chart],
    [decorative, decoration],
  ] as const) {
    expect(url).toMatch(/^\/api\/uploads\/[a-f0-9-]+\.(png|gif)$/);
    expect(rows.find((row) => row.filename === filename(url))?.bytes).toBe(asset.bytes.length);
    expect(new Uint8Array(await readFile(join(config.UPLOADS_DIR, filename(url))))).toEqual(asset.bytes);
    const res = await request(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(asset.type);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(asset.bytes);
  }
  expect(await uploadsRepo.referencedFilenames()).toEqual(expect.arrayContaining(rows.map((row) => row.filename)));
  return { graph, decorative };
}

test.each(["draft", "scheduled", "published"] as const)(
  "%s API create, reload, partial edit and body update preserve accessibility metadata",
  async (status) => {
    const owner = await actor("writer");
    const source = await create(owner, status);
    const stored = (await ownPosts(owner.user.id))[0];
    expect(stored.contentHtml).toBe(source.html);
    expect(stored.publishAt?.toISOString() ?? null).toBe(source.publishAt);
    expect((await read(source.post.id, owner.cookie)).contentHtml).toBe(source.html);
    for (const change of [{ title: "Reviewed report" }, { tags: ["reports"] }]) {
      const res = await json(`/api/posts/${source.post.id}`, owner.cookie, change, "PATCH");
      expect(res.status).toBe(200);
      expect(SavedPostResponse.parse(await res.json()).post.contentHtml).toBe(source.html);
      expect((await read(source.post.id, owner.cookie)).contentHtml).toBe(source.html);
    }
    const edited = `${source.html}<p lang="ar" dir="rtl">A reviewed passage.</p>`;
    const update = await json(`/api/posts/${source.post.id}`, owner.cookie, { contentHtml: edited }, "PATCH");
    expect(update.status).toBe(200);
    const reread = await read(source.post.id, owner.cookie);
    expect(reread.contentHtml).toBe(edited);
    expect(reread).toMatchObject({
      status,
      publishAt: source.publishAt,
      language: "en",
      coverUrl: source.graph,
      coverCredit: credit,
    });
    expect(load(reread.contentHtml)('p[lang="ar"]').attr("dir")).toBe("rtl");
    await expectStoredImages(owner, reread.contentHtml);
  },
);

test.each(["draft", "scheduled", "published"] as const)(
  "%s database content exports to native, offline HTML and WordPress with the same image associations",
  async (status) => {
    const owner = await actor("writer");
    const source = await create(owner, status);
    await mkPost((await mkUser("other")).id, "Not the owner's post");
    await mkRemotePost((await mkRemoteActor("remote@elsewhere.test")).id, "remote-post");
    const orphan = await upload(owner.cookie, chart);
    const { files, manifest } = await exported(owner.cookie);
    expect(manifest.posts).toHaveLength(1);
    const [post] = manifest.posts;
    expect(post).toMatchObject({
      key: `${origin}/posts/${source.post.id}`,
      status,
      language: "en",
      summary: "An illustrated sales report.",
      coverUrl: mediaPath(source.graph),
      coverCredit: credit,
      protected: false,
    });
    expect(post.tags.toSorted()).toEqual(["accessibility", "reports"]);
    expectFixture(post.contentHtml, mediaPath(source.graph), mediaPath(source.decorative));
    expect(Object.keys(files).toSorted()).toEqual(
      [
        "README.txt",
        "omicron.json",
        "wordpress.xml",
        `posts/${source.post.id}.html`,
        mediaPath(source.graph),
        mediaPath(source.decorative),
      ].toSorted(),
    );
    expect(files[mediaPath(source.graph)]).toEqual(chart.bytes);
    expect(files[mediaPath(source.decorative)]).toEqual(decoration.bytes);
    expect(files[mediaPath(orphan)]).toBeUndefined();
    const offline = strFromU8(files[`posts/${source.post.id}.html`]);
    expectFixture(offline, `../${mediaPath(source.graph)}`, `../${mediaPath(source.decorative)}`);
    const $ = load(offline);
    expect($("html").attr("lang")).toBe("en");
    expect($('link[rel="canonical"]').attr("href")).toBe(`${origin}/@writer/${source.post.slug}`);
    const xml = load(strFromU8(files["wordpress.xml"]), { xml: true });
    expect(xml("item")).toHaveLength(1);
    expectFixture(xml("content\\:encoded").text(), `${origin}${source.graph}`, `${origin}${source.decorative}`);
    expect((await ownPosts(owner.user.id))[0].contentHtml).toBe(source.html);
  },
);

test("native preview is read-only and re-import restores real bytes without the source files, including a second hop", async () => {
  const owner = await actor("writer");
  const source = await create(owner);
  const archive = await exported(owner.cookie);
  const destination = await actor("destination");
  const before = await readdir(config.UPLOADS_DIR);
  expect((await preview(owner.cookie, archive.bytes)).items[0].duplicate).toBe(true);
  const review = await preview(destination.cookie, archive.bytes);
  expect(review.imageCount).toBe(2);
  expect(review.items[0].duplicate).toBe(false);
  expect(await ownPosts(destination.user.id)).toEqual([]);
  expect(await ownUploads(destination.user.id)).toEqual([]);
  expect(await readdir(config.UPLOADS_DIR)).toEqual(before);
  await unlink(join(config.UPLOADS_DIR, filename(source.graph)));
  await unlink(join(config.UPLOADS_DIR, filename(source.decorative)));
  expect(await imported(destination.cookie, archive.bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [restored] = await ownPosts(destination.user.id);
  expect(restored.id).not.toBe(source.post.id);
  expect(restored).toMatchObject({
    externalId: importKey(archive.manifest.posts[0].key),
    language: "en",
    summary: "An illustrated sales report.",
    coverCredit: credit,
    contentJson: null,
    status: "draft",
    publishAt: null,
  });
  expect(restored.createdAt.toISOString()).toBe(archive.manifest.posts[0].createdAt);
  expect(restored.updatedAt.toISOString()).toBe(archive.manifest.posts[0].updatedAt);
  expect((await tagsRepo.tagsForPost(restored.id)).map((tag) => tag.slug).toSorted()).toEqual([
    "accessibility",
    "reports",
  ]);
  const images = await expectStoredImages(destination, (await read(restored.id, destination.cookie)).contentHtml);
  expect(images.graph).not.toBe(source.graph);
  expect(restored.coverUrl).toBe(images.graph);
  const secondExport = await exported(destination.cookie);
  expect(secondExport.manifest.posts[0].key).toBe(restored.externalId);
  const third = await actor("third");
  expect(await imported(third.cookie, secondExport.bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [thirdPost] = await ownPosts(third.user.id);
  expect(thirdPost.externalId).toBe(restored.externalId);
  await expectStoredImages(third, thirdPost.contentHtml);
});

test("retries never overwrite reviewed alternatives or allocate extra media, and identities are per owner", async () => {
  const owner = await actor("writer");
  await create(owner);
  const archive = await exported(owner.cookie);
  const destination = await actor("destination");
  expect(await imported(destination.cookie, archive.bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [post] = await ownPosts(destination.user.id);
  const reviewed = post.contentHtml.replace("Sales increased from 10 to 20", "Sales doubled after review");
  expect((await json(`/api/posts/${post.id}`, destination.cookie, { contentHtml: reviewed }, "PATCH")).status).toBe(
    200,
  );
  const files = await readdir(config.UPLOADS_DIR);
  const rows = await ownUploads(destination.user.id);
  expect((await preview(destination.cookie, archive.bytes)).items[0].duplicate).toBe(true);
  expect(await imported(destination.cookie, archive.bytes)).toEqual({ imported: 0, skipped: 1, failed: [] });
  expect((await ownPosts(destination.user.id))[0].contentHtml).toBe(reviewed);
  expect(await ownUploads(destination.user.id)).toEqual(rows);
  expect(await readdir(config.UPLOADS_DIR)).toEqual(files);
  const other = await actor("other");
  expect((await preview(other.cookie, archive.bytes)).items[0].duplicate).toBe(false);
  expect(await imported(other.cookie, archive.bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [otherPost] = await ownPosts(other.user.id);
  expect(otherPost.externalId).toBe(post.externalId);
  await expectStoredImages(other, otherPost.contentHtml);
});

test("concurrent imports commit once and remove the losing request's unreferenced images", async () => {
  const owner = await actor("writer");
  await create(owner);
  const { bytes } = await exported(owner.cookie);
  const destination = await actor("destination");
  const insert = portabilityRepo.insertPost;
  const { promise: bothReady, resolve } = Promise.withResolvers<void>();
  let arrivals = 0;
  // Both requests must allocate images before racing the real INSERT.
  vi.spyOn(portabilityRepo, "insertPost").mockImplementation(async (data, tags) => {
    if (++arrivals === 2) resolve();
    await bothReady;
    return insert(data, tags);
  });
  const results = await Promise.all([imported(destination.cookie, bytes), imported(destination.cookie, bytes)]);
  expect(arrivals).toBe(2);
  expect(results.map((result) => result.imported).toSorted((a, b) => a - b)).toEqual([0, 1]);
  expect(results.map((result) => result.skipped).toSorted((a, b) => a - b)).toEqual([0, 1]);
  expect(results.flatMap((result) => result.failed)).toEqual([]);
  const posts = await ownPosts(destination.user.id);
  expect(posts).toHaveLength(1);
  await expectStoredImages(destination, posts[0].contentHtml);
  expect(await readdir(config.UPLOADS_DIR)).toHaveLength(4);
});

test("WordPress re-import stores body metadata and absolute image links without downloading another copy", async () => {
  const owner = await actor("writer");
  const source = await create(owner);
  const { files } = await exported(owner.cookie);
  const destination = await actor("destination");
  const before = await readdir(config.UPLOADS_DIR);
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outbound image request"));
  const review = await preview(destination.cookie, files["wordpress.xml"]);
  expect(review.format).toBe("wordpress");
  expect(review.imageCount).toBe(0);
  expect(review.items[0].warnings).toContain("External images remain linked; they are not downloaded or backed up.");
  expect(await imported(destination.cookie, files["wordpress.xml"])).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [post] = await ownPosts(destination.user.id);
  expectFixture(
    (await read(post.id, destination.cookie)).contentHtml,
    `${origin}${source.graph}`,
    `${origin}${source.decorative}`,
  );
  expect(await ownUploads(destination.user.id)).toEqual([]);
  expect(await readdir(config.UPLOADS_DIR)).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});

test.each(["medium", "substack"] as const)(
  "%s import persists descriptions and rehosts bundled bytes",
  async (format) => {
    const body = content("../media/chart.png", "../media/decoration.gif");
    const files: Record<string, Uint8Array> = {
      "media/chart.png": chart.bytes,
      "media/decoration.gif": decoration.bytes,
    };
    if (format === "medium") {
      files["posts/report.html"] = strToU8(
        `<h1 class="p-name">Accessible report</h1><section class="e-content">${body}</section>` +
          '<time class="dt-published" datetime="2024-01-02T00:00:00Z"></time>',
      );
    } else {
      files["posts.csv"] = strToU8(
        "post_id,title,post_date,is_published,audience\n1.report,Accessible report,2024-01-02T00:00:00Z,true,everyone\n",
      );
      files["posts/1.report.html"] = strToU8(body);
    }
    const destination = await actor("destination");
    const bytes = zipSync(files);
    const review = await preview(destination.cookie, bytes);
    expect(review.format).toBe(format);
    expect(review.imageCount).toBe(2);
    expect(await imported(destination.cookie, bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
    const [post] = await ownPosts(destination.user.id);
    expect(post.status).toBe("draft");
    await expectStoredImages(destination, (await read(post.id, destination.cookie)).contentHtml);
  },
);

test("RSS import persists body metadata while leaving external images linked", async () => {
  const graph = "https://media.example/chart.png";
  const decorative = "https://media.example/decoration.gif";
  const bytes = strToU8(
    '<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>' +
      "<title>Accessible report</title><guid>https://source.example/report</guid>" +
      `<pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate><content:encoded><![CDATA[${content(graph, decorative)}]]></content:encoded>` +
      "</item></channel></rss>",
  );
  const destination = await actor("destination");
  expect((await preview(destination.cookie, bytes)).format).toBe("rss");
  expect(await imported(destination.cookie, bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [post] = await ownPosts(destination.user.id);
  expectFixture((await read(post.id, destination.cookie)).contentHtml, graph, decorative);
  expect(await ownUploads(destination.user.id)).toEqual([]);
  expect(await readdir(config.UPLOADS_DIR)).toEqual([]);
});

test.each([
  { status: "published", isPrivate: false, preserve: true, expected: "published" },
  { status: "published", isPrivate: false, preserve: false, expected: "draft" },
  { status: "published", isPrivate: true, preserve: true, expected: "draft" },
  { status: "scheduled", isPrivate: false, preserve: true, expected: "draft" },
] as const)(
  "import publication policy preserves body metadata: %j",
  async ({ status, isPrivate, preserve, expected }) => {
    const owner = await actor("writer", isPrivate);
    await create(owner, status);
    const archive = await exported(owner.cookie);
    const destination = await actor("destination");
    expect(await imported(destination.cookie, archive.bytes, preserve)).toEqual({
      imported: 1,
      skipped: 0,
      failed: [],
    });
    const [post] = await ownPosts(destination.user.id);
    expect(post).toMatchObject({ status: expected, publishAt: null });
    await expectStoredImages(destination, post.contentHtml);
    expect((await request(`/api/posts/${post.id}`)).status).toBe(expected === "published" ? 200 : 404);
  },
);

test("other users cannot read or change a draft's metadata, and exports require a real session", async () => {
  const owner = await actor("writer");
  const source = await create(owner);
  const other = await actor("other");
  expect((await request(`/api/posts/${source.post.id}`, other.cookie)).status).toBe(404);
  expect(
    (await json(`/api/posts/${source.post.id}`, other.cookie, { contentHtml: "<p>Overwrite</p>" }, "PATCH")).status,
  ).toBe(403);
  expect((await request("/api/content/export")).status).toBe(401);
  const unrelated = await exported(other.cookie);
  expect(unrelated.manifest.posts).toEqual([]);
  expect(Object.keys(unrelated.files).some((path) => path.startsWith("media/"))).toBe(false);
  expect((await ownPosts(owner.user.id))[0].contentHtml).toBe(source.html);
});

test("a missing real image refuses export rather than returning an incomplete accessibility archive", async () => {
  const owner = await actor("writer");
  const source = await create(owner);
  await unlink(join(config.UPLOADS_DIR, filename(source.decorative)));
  const res = await request("/api/content/export", owner.cookie);
  expect(res.status).toBe(400);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(await res.json()).toEqual({
    error: "An image referenced by your posts is missing from storage. The export was not created.",
  });
  expect((await ownPosts(owner.user.id))[0].contentHtml).toBe(source.html);
  expect(await ownUploads(owner.user.id)).toHaveLength(2);
});

test.each(["missing", "corrupt"])("%s bundled media is rejected before preview/import writes", async (failure) => {
  const owner = await actor("writer");
  const source = await create(owner);
  const archive = await exported(owner.cookie);
  const path = mediaPath(source.decorative);
  if (failure === "missing") delete archive.files[path];
  else archive.files[path] = strToU8("not an image");
  const bytes = zipSync(archive.files);
  const destination = await actor("destination");
  const before = await readdir(config.UPLOADS_DIR);
  for (const action of ["preview", "import"]) {
    const res = await archiveRequest(action, destination.cookie, bytes);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(failure === "missing" ? /image is missing/ : /bundled image is invalid/);
  }
  expect(await ownPosts(destination.user.id)).toEqual([]);
  expect(await ownUploads(destination.user.id)).toEqual([]);
  expect(await readdir(config.UPLOADS_DIR)).toEqual(before);
});

test("a real SQL failure rolls back the post and tags, removes imported files/quota, and allows a complete retry", async () => {
  const owner = await actor("writer");
  await create(owner);
  const { bytes } = await exported(owner.cookie);
  const destination = await actor("destination");
  const before = await readdir(config.UPLOADS_DIR);
  // PostgreSQL rejects NUL text after the real post insert, exercising rollback.
  vi.spyOn(tagsRepo, "resolveSlugs").mockResolvedValueOnce(["invalid\0tag"]);
  const failed = await imported(destination.cookie, bytes);
  expect(failed).toMatchObject({ imported: 0, skipped: 0, failed: [{ title: "Accessible report" }] });
  expect(await ownPosts(destination.user.id)).toEqual([]);
  expect(await ownUploads(destination.user.id)).toEqual([]);
  expect(await uploadsRepo.sumBytesForUser(destination.user.id)).toBe(0);
  expect(await readdir(config.UPLOADS_DIR)).toEqual(before);
  expect(await imported(destination.cookie, bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [post] = await ownPosts(destination.user.id);
  await expectStoredImages(destination, post.contentHtml);
  expect((await tagsRepo.tagsForPost(post.id)).map((tag) => tag.slug).toSorted()).toEqual(["accessibility", "reports"]);
});

test("a failed post does not delete bundled images shared by a successfully imported post", async () => {
  const owner = await actor("writer");
  await create(owner);
  const archive = await exported(owner.cookie);
  archive.manifest.posts.push({ ...archive.manifest.posts[0], key: "second-report", title: "Second report" });
  archive.files["omicron.json"] = strToU8(JSON.stringify(archive.manifest));
  const destination = await actor("destination");
  vi.spyOn(tagsRepo, "resolveSlugs").mockResolvedValueOnce(["invalid\0tag"]);
  expect(await imported(destination.cookie, zipSync(archive.files))).toMatchObject({
    imported: 1,
    skipped: 0,
    failed: [{ title: "Accessible report" }],
  });
  const posts = await ownPosts(destination.user.id);
  expect(posts).toHaveLength(1);
  expect(posts[0].title).toBe("Second report");
  await expectStoredImages(destination, posts[0].contentHtml);
  expect(await readdir(config.UPLOADS_DIR)).toHaveLength(4);
});

test("a real file-write failure releases reserved quota and permits a retry", async () => {
  const owner = await actor("writer");
  const id = "00000000-0000-4000-8000-000000000001";
  await mkdir(join(config.UPLOADS_DIR, `${id}.png`));
  vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(id);
  await expect(saveImage(owner.user.id, chart.bytes, chart.type)).rejects.toMatchObject({ code: "EISDIR" });
  expect(await uploadsRepo.sumBytesForUser(owner.user.id)).toBe(0);
  expect(await ownUploads(owner.user.id)).toEqual([]);
  await upload(owner.cookie, chart);
  expect(await uploadsRepo.sumBytesForUser(owner.user.id)).toBe(chart.bytes.length);
});

test("a storage-directory failure releases reserved upload quota and allows import retry", async () => {
  const owner = await actor("writer");
  await create(owner);
  const { bytes } = await exported(owner.cookie);
  const destination = await actor("destination");
  const directory = config.UPLOADS_DIR;
  const blocker = join(directory, "not-a-directory");
  await writeFile(blocker, "blocked");
  config.UPLOADS_DIR = blocker;
  expect(await imported(destination.cookie, bytes)).toMatchObject({
    imported: 0,
    skipped: 0,
    failed: [{ title: "Accessible report" }],
  });
  expect(await ownPosts(destination.user.id)).toEqual([]);
  expect(await uploadsRepo.sumBytesForUser(destination.user.id)).toBe(0);
  expect(await ownUploads(destination.user.id)).toEqual([]);
  config.UPLOADS_DIR = directory;
  await unlink(blocker);
  expect(await imported(destination.cookie, bytes)).toEqual({ imported: 1, skipped: 0, failed: [] });
  const [post] = await ownPosts(destination.user.id);
  await expectStoredImages(destination, post.contentHtml);
});
