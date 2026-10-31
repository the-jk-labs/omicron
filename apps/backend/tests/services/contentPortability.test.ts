// SPDX-License-Identifier: AGPL-3.0-or-later
import { ContentArchive, ContentImportPreview, ContentImportResult } from "@omicron/contract";
import { strToU8, unzipSync, zipSync } from "fflate";
import { beforeEach, expect, test, vi } from "vitest";
import { postRow, userRow } from "../fixtures.ts";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn<() => Promise<Uint8Array>>(),
  unlink: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock(import("@/db/repositories/contentPortability.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/uploads.ts"));
vi.mock(import("@/services/instanceSetup.ts"), () => ({
  getOrigin: vi.fn<() => Promise<string>>(async () => "https://old.example"),
}));
vi.mock(import("@/services/media.ts"), async (original) => ({
  ...(await original()),
  saveImage: vi.fn<typeof saveImage>(),
}));
vi.mock(import("@/services/postSlugs.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } }));

import { readFile, unlink } from "node:fs/promises";
import * as repo from "@/db/repositories/contentPortability.ts";
import * as tags from "@/db/repositories/tags.ts";
import * as uploads from "@/db/repositories/uploads.ts";
import { importKey, parseArchive } from "@/lib/contentArchive.ts";
import { badRequest } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";
import { exportContent, importContent, preview } from "@/services/contentPortability.ts";
import { saveImage } from "@/services/media.ts";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const post = (overrides = {}) => ({
  key: "https://source.test/posts/one",
  title: "A story",
  contentHtml: "<p>Body</p>",
  status: "published",
  createdAt: "2024-01-02T00:00:00.000Z",
  updatedAt: "2024-02-03T00:00:00.000Z",
  tags: ["tech"],
  language: "en",
  summary: null,
  coverUrl: null,
  coverCredit: null,
  aiAssisted: false,
  protected: false,
  ...overrides,
});
const archive = (posts = [post()], files = {}) =>
  zipSync({
    "omicron.json": strToU8(
      JSON.stringify({ format: "omicron", version: 1, exportedAt: "2026-01-01T00:00:00Z", posts }),
    ),
    ...files,
  });

beforeEach(() => {
  vi.mocked(repo.identities).mockResolvedValue([]);
  vi.mocked(repo.listOwn).mockResolvedValue([]);
  vi.mocked(repo.insertPost).mockImplementation(async (data) => postRow({ ...data, id: "new" }) as never);
  vi.mocked(tags.tagsForPosts).mockResolvedValue(new Map());
  vi.mocked(saveImage).mockResolvedValue("/api/uploads/new.png");
  vi.mocked(readFile).mockResolvedValue(png as never);
});

test("preview matches the contract, detects existing posts, and writes nothing", async () => {
  vi.mocked(repo.identities).mockResolvedValue([{ id: "one", externalId: importKey("https://source.test/posts/one") }]);
  const result = await preview("me", archive());
  expect(ContentImportPreview.parse(result).items[0].duplicate).toBe(true);
  expect(repo.identities).toHaveBeenCalledWith("me");
  expect(repo.insertPost).not.toHaveBeenCalled();
  expect(saveImage).not.toHaveBeenCalled();
});

test("imports as drafts by default with preserved dates, tags, and safe HTML", async () => {
  const result = await importContent("me", archive(), false);
  expect(ContentImportResult.parse(result)).toEqual({ imported: 1, skipped: 0, failed: [] });
  expect(repo.insertPost).toHaveBeenCalledWith(
    expect.objectContaining({
      authorId: "me",
      status: "draft",
      contentJson: null,
      publishAt: null,
      createdAt: new Date("2024-01-02T00:00:00Z"),
      updatedAt: new Date("2024-02-03T00:00:00Z"),
    }),
    ["tech"],
  );
  expect(queue.add).not.toHaveBeenCalled();
});

test("only explicit opt-in publishes public posts; protected and scheduled content stays draft", async () => {
  await importContent(
    "me",
    archive([
      post(),
      post({ key: "paid", protected: true }),
      post({ key: "scheduled", status: "scheduled" }),
      post({ key: "future", createdAt: "2999-01-01T00:00:00Z" }),
      post({ key: "untitled", title: null }),
    ]),
    true,
  );
  expect(vi.mocked(repo.insertPost).mock.calls.map(([data]) => data.status)).toEqual([
    "published",
    "draft",
    "draft",
    "draft",
    "draft",
  ]);
  expect(queue.add).toHaveBeenCalledTimes(2);
});

test("Medium stories remain drafts because their exports cannot prove public visibility", async () => {
  const zip = zipSync({
    "posts/story.html": strToU8(
      '<h1 class="p-name">Medium</h1><section class="e-content"><p>Body</p></section><time class="dt-published" datetime="2024-01-01T00:00:00Z"></time>',
    ),
  });
  expect((await preview("me", zip)).warnings.join(" ")).toContain("All Medium posts are imported as drafts");
  await importContent("me", zip, true);
  expect(repo.insertPost).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }), []);
});

test("repeat imports and concurrent insert conflicts skip instead of overwrite", async () => {
  vi.mocked(repo.identities).mockResolvedValue([{ id: "one", externalId: importKey("https://source.test/posts/one") }]);
  expect(await importContent("me", archive(), false)).toEqual({ imported: 0, skipped: 1, failed: [] });
  expect(repo.insertPost).not.toHaveBeenCalled();
  vi.mocked(repo.identities).mockResolvedValue([]);
  vi.mocked(repo.insertPost).mockResolvedValue(null);
  expect(await importContent("me", archive(), false)).toEqual({ imported: 0, skipped: 1, failed: [] });
});

test("bundled images are validated, uploaded once, and rewritten in bodies and covers", async () => {
  const zip = archive(
    [
      post({ contentHtml: '<p><img src="media/one.png"></p>', coverUrl: "media/one.png" }),
      post({ key: "two", contentHtml: '<img src="media/one.png">' }),
    ],
    { "media/one.png": png },
  );
  expect((await preview("me", zip)).imageCount).toBe(1);
  expect(saveImage).not.toHaveBeenCalled();
  expect((await importContent("me", zip, false)).imported).toBe(2);
  expect(saveImage).toHaveBeenCalledTimes(1);
  expect(repo.insertPost).toHaveBeenCalledWith(
    expect.objectContaining({
      contentHtml: expect.stringContaining("/api/uploads/new.png"),
      coverUrl: "/api/uploads/new.png",
    }),
    ["tech"],
  );
});

test("invalid or missing bundled images fail before any writes", async () => {
  for (const files of [{}, { "media/one.png": strToU8("not an image") }]) {
    await expect(
      importContent("me", archive([post({ contentHtml: '<img src="media/one.png">' })], files), false),
    ).rejects.toMatchObject({ status: 400 });
  }
  expect(repo.insertPost).not.toHaveBeenCalled();
  expect(saveImage).not.toHaveBeenCalled();
});

test("external URLs are not fetched or uploaded and a warning is shown", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const zip = archive([post({ contentHtml: '<img src="http://127.0.0.1/internal.png">' })]);
  expect((await preview("me", zip)).items[0].warnings.join(" ")).toContain("External images");
  await importContent("me", zip, false);
  expect(fetch).not.toHaveBeenCalled();
  expect(saveImage).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

test("reports per-post failures without hiding successful imports or leaking internal errors", async () => {
  vi.mocked(repo.insertPost).mockRejectedValueOnce(new Error("private DB detail"));
  const result = await importContent("me", archive([post(), post({ key: "two" })]), false);
  expect(result.imported).toBe(1);
  expect(result.failed).toHaveLength(1);
  expect(result.failed[0].error).not.toContain("private DB detail");
});

test("quota failures are actionable and leave the post unwritten", async () => {
  vi.mocked(saveImage).mockRejectedValueOnce(badRequest("Storage full"));
  const result = await importContent(
    "me",
    archive([post({ contentHtml: '<img src="media/one.png">' })], { "media/one.png": png }),
    false,
  );
  expect(result.failed[0].error).toBe("Storage full");
  expect(repo.insertPost).not.toHaveBeenCalled();
});

test("failed posts release unused images and their quota reservations", async () => {
  vi.mocked(repo.insertPost).mockRejectedValueOnce(new Error("DB unavailable"));
  const result = await importContent(
    "me",
    archive([post({ contentHtml: '<img src="media/one.png">' })], { "media/one.png": png }),
    false,
  );
  expect(result.failed).toHaveLength(1);
  expect(unlink).toHaveBeenCalledWith(expect.stringContaining("/new.png"));
  expect(uploads.removeByFilename).toHaveBeenCalledWith("new.png");
});

test("exports only owned local rows via the repository, including drafts and uploads, and round-trips", async () => {
  const row = postRow({
    id: "one",
    authorId: "me",
    title: "A & B",
    contentHtml: '<p><img src="/api/uploads/old.png"></p>',
    status: "draft",
    coverUrl: "/api/uploads/old.png",
  });
  vi.mocked(repo.listOwn).mockResolvedValue([row]);
  vi.mocked(tags.tagsForPosts).mockResolvedValue(new Map([["one", [{ slug: "tech", name: "tech" }]]]));
  const bytes = await exportContent(userRow({ id: "me" }));
  expect(repo.listOwn).toHaveBeenCalledWith("me", 1001);
  const files = unzipSync(bytes);
  const manifest = ContentArchive.parse(JSON.parse(new TextDecoder().decode(files["omicron.json"])));
  expect(manifest.posts[0]).toMatchObject({
    title: "A & B",
    status: "draft",
    tags: ["tech"],
    coverUrl: "media/old.png",
  });
  expect(manifest).not.toHaveProperty("email");
  expect(files["media/old.png"]).toEqual(png);
  expect(new TextDecoder().decode(files["posts/one.html"])).toContain('src="../media/old.png"');
  expect(parseArchive(bytes).posts[0].contentHtml).toContain('src="media/old.png"');
  expect(parseArchive(files["wordpress.xml"]).posts[0]).toMatchObject({
    title: "A & B",
    status: "draft",
    tags: ["tech"],
  });
});

test("re-export preserves imported identity so migration chains stay idempotent", async () => {
  const key = importKey("https://first.test/post");
  vi.mocked(repo.listOwn).mockResolvedValue([postRow({ externalId: key })]);
  const bytes = await exportContent(userRow());
  expect(parseArchive(bytes).posts[0].key).toBe(key);
});

test("a private account export is protected and restores as drafts even with publication enabled", async () => {
  vi.mocked(repo.listOwn).mockResolvedValue([postRow({ status: "published" })]);
  const bytes = await exportContent(userRow({ isPrivate: true }));
  expect(parseArchive(bytes).posts[0].protected).toBe(true);
  await importContent("destination", bytes, true);
  expect(repo.insertPost).toHaveBeenCalledWith(expect.objectContaining({ status: "draft" }), []);
});

test("missing local images fail the export rather than producing a broken backup", async () => {
  vi.mocked(repo.listOwn).mockResolvedValue([postRow({ contentHtml: '<img src="/api/uploads/missing.png">' })]);
  vi.mocked(readFile).mockRejectedValueOnce(new Error("ENOENT"));
  await expect(exportContent(userRow())).rejects.toThrow("missing from storage");
});
