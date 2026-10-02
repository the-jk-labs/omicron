// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { postRow, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/webhookTokens.ts"));
vi.mock(import("@/services/postSlugs.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import { config } from "@/config.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as tokensRepo from "@/db/repositories/webhookTokens.ts";
import { generateToken, hashToken } from "@/lib/webhook.ts";
import { queue } from "@/queue/queue.ts";
import { syncSlug } from "@/services/postSlugs.ts";
import { authenticate, ingestContent } from "@/services/webhooks.ts";

const SECRET = "0123456789abcdef-instance-secret";
const author = userRow({ id: "author", username: "ada" });
const original = { secret: config.WEBHOOK_SECRET, author: config.WEBHOOK_AUTHOR };

const NOW = new Date("2026-06-01T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  config.WEBHOOK_SECRET = SECRET;
  config.WEBHOOK_AUTHOR = undefined;
  vi.mocked(usersRepo.firstUser).mockResolvedValue(author);
  vi.mocked(tokensRepo.touchLastUsed).mockResolvedValue(undefined);
  vi.mocked(syncSlug).mockImplementation(async (p) => p.slug ?? "the-slug");
  vi.mocked(postsRepo.findByExternalId).mockResolvedValue(undefined);
  vi.mocked(postsRepo.upsertByExternalId).mockImplementation(
    async (data) => postRow({ id: "new", slug: null, ...data }) as never,
  );
  vi.mocked(postsRepo.update).mockImplementation(async (id, data) => postRow({ id, ...data }) as never);
});

afterEach(() => {
  vi.useRealTimers();
  config.WEBHOOK_SECRET = original.secret;
  config.WEBHOOK_AUTHOR = original.author;
});

const headers = (h: Record<string, string>) => new Headers(h);

describe("authenticate", () => {
  test("accepts the instance secret in either header and publishes as the oldest account", async () => {
    expect(await authenticate(headers({ "x-webhook-secret": SECRET }))).toBe(author);
    expect(await authenticate(headers({ authorization: `Bearer ${SECRET}` }))).toBe(author);
  });

  test("WEBHOOK_AUTHOR pins the account by username", async () => {
    config.WEBHOOK_AUTHOR = "bob";
    const bob = userRow({ id: "bob", username: "bob" });
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(bob);
    expect(await authenticate(headers({ "x-webhook-secret": SECRET }))).toBe(bob);
    expect(usersRepo.findByUsername).toHaveBeenCalledWith("bob");
  });

  test.for<Record<string, string>>([
    {},
    { "x-webhook-secret": "wrong" },
    { authorization: "Basic abc" },
    { authorization: "Bearer " },
  ])("refuses %o with a flat 401", async (h) => {
    await expect(authenticate(headers(h))).rejects.toMatchObject({
      status: 401,
      message: "Invalid webhook credentials.",
    });
  });

  test("with no instance secret configured, nothing matches it", async () => {
    config.WEBHOOK_SECRET = undefined;
    await expect(authenticate(headers({ "x-webhook-secret": "" }))).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(headers({ "x-webhook-secret": "anything" }))).rejects.toMatchObject({ status: 401 });
  });

  test("a misconfigured or missing author is a 503 naming the problem", async () => {
    config.WEBHOOK_AUTHOR = "ghost";
    vi.mocked(usersRepo.findByUsername).mockResolvedValue(undefined);
    await expect(authenticate(headers({ "x-webhook-secret": SECRET }))).rejects.toMatchObject({
      status: 503,
      message: 'Content ingestion is misconfigured: no local account named "ghost".',
    });
    config.WEBHOOK_AUTHOR = undefined;
    vi.mocked(usersRepo.firstUser).mockResolvedValue(undefined);
    await expect(authenticate(headers({ "x-webhook-secret": SECRET }))).rejects.toMatchObject({ status: 503 });
  });

  test("a suspended or deleted author is a 503", async () => {
    vi.mocked(usersRepo.firstUser).mockResolvedValue(userRow({ suspendedAt: new Date() }));
    await expect(authenticate(headers({ "x-webhook-secret": SECRET }))).rejects.toMatchObject({ status: 503 });
    vi.mocked(usersRepo.firstUser).mockResolvedValue(userRow({ deletedAt: new Date() }));
    await expect(authenticate(headers({ "x-webhook-secret": SECRET }))).rejects.toMatchObject({ status: 503 });
  });

  describe("per-user tokens", () => {
    test("resolve to their owner by hash and record the use", async () => {
      const token = generateToken();
      vi.mocked(tokensRepo.findLive).mockResolvedValue({ id: "t1", userId: "bob" } as never);
      vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "bob" }));
      expect((await authenticate(headers({ authorization: `Bearer ${token}` }))).id).toBe("bob");
      expect(tokensRepo.findLive).toHaveBeenCalledWith(await hashToken(token));
      expect(tokensRepo.touchLastUsed).toHaveBeenCalledWith("t1");
    });

    test("work even when the instance secret is unset", async () => {
      config.WEBHOOK_SECRET = undefined;
      vi.mocked(tokensRepo.findLive).mockResolvedValue({ id: "t1", userId: "bob" } as never);
      vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "bob" }));
      await expect(authenticate(headers({ "x-webhook-secret": generateToken() }))).resolves.toBeDefined();
    });

    test("an unknown or revoked token is a 401", async () => {
      vi.mocked(tokensRepo.findLive).mockResolvedValue(undefined);
      await expect(authenticate(headers({ "x-webhook-secret": generateToken() }))).rejects.toMatchObject({
        status: 401,
      });
    });

    test("a token whose owner vanished is a 401; a suspended or deleted owner a 403", async () => {
      vi.mocked(tokensRepo.findLive).mockResolvedValue({ id: "t1", userId: "bob" } as never);
      vi.mocked(usersRepo.findById).mockResolvedValue(undefined);
      await expect(authenticate(headers({ "x-webhook-secret": generateToken() }))).rejects.toMatchObject({
        status: 401,
      });
      vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ suspendedAt: new Date() }));
      await expect(authenticate(headers({ "x-webhook-secret": generateToken() }))).rejects.toMatchObject({
        status: 403,
      });
      vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ deletedAt: new Date() }));
      await expect(authenticate(headers({ "x-webhook-secret": generateToken() }))).rejects.toMatchObject({
        status: 403,
      });
    });

    test("a failure recording last use never fails the request", async () => {
      vi.mocked(tokensRepo.findLive).mockResolvedValue({ id: "t1", userId: "bob" } as never);
      vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "bob" }));
      vi.mocked(tokensRepo.touchLastUsed).mockRejectedValue(new Error("db down"));
      await expect(authenticate(headers({ "x-webhook-secret": generateToken() }))).resolves.toBeDefined();
    });
  });
});

describe("ingestContent (create)", () => {
  test("renders, sanitizes and publishes a new post, federating a Create", async () => {
    const out = await ingestContent(
      { slug: "doc-42", title: "Hello", body: "# Hi\n\nSome **text**.\n\n<script>alert(1)</script>" },
      author,
    );
    const data = vi.mocked(postsRepo.upsertByExternalId).mock.calls[0][0];
    expect(data).toMatchObject({ authorId: "author", externalId: "doc-42", title: "Hello", status: "published" });
    expect(data.contentHtml).toContain("<strong>text</strong>");
    // Raw HTML is escaped into visible text, never emitted as markup.
    expect(data.contentHtml).not.toContain("<script");
    expect(data.contentHtml).toContain("&lt;script&gt;");
    expect(data.contentJson).toBe(null);
    expect(data.summary).toBeTruthy();
    expect(out).toEqual({ id: "new", slug: "doc-42", status: "published", created: true });
    expect(queue.add).toHaveBeenCalledWith("federate_post", { postId: "new", action: "create" });
  });

  test("a create needs a title and a body", async () => {
    await expect(ingestContent({ slug: "x", body: "b" }, author)).rejects.toMatchObject({ status: 400 });
    await expect(ingestContent({ slug: "x", title: "t" }, author)).rejects.toMatchObject({ status: 400 });
    expect(postsRepo.upsertByExternalId).not.toHaveBeenCalled();
  });

  test("a body that renders to nothing is refused", async () => {
    await expect(ingestContent({ slug: "x", title: "t", body: "   \n  " }, author)).rejects.toMatchObject({
      status: 400,
      message: "`body` contains no renderable content.",
    });
  });

  test("a draft is stored without federating", async () => {
    await ingestContent({ slug: "x", title: "t", body: "b", status: "draft" }, author);
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("an explicit description is the summary", async () => {
    await ingestContent({ slug: "x", title: "t", body: "Body text.", description: "Curated." }, author);
    expect(vi.mocked(postsRepo.upsertByExternalId).mock.calls[0][0].summary).toBe("Curated.");
  });

  test("language, banner and tags pass through", async () => {
    await ingestContent(
      { slug: "x", title: "t", body: "b", language: "pt-BR", banner: "https://img.example/a.jpg", tags: ["#Deno"] },
      author,
    );
    expect(postsRepo.upsertByExternalId).toHaveBeenCalledWith(
      expect.objectContaining({ language: "pt", coverUrl: "https://img.example/a.jpg", coverCredit: null }),
    );
    expect(tagsRepo.setPostTags).toHaveBeenCalledWith("new", ["deno"]);
  });

  test("a new post gets a readable slug from its title", async () => {
    vi.mocked(syncSlug).mockResolvedValue("hello");
    await ingestContent({ slug: "doc-1", title: "Hello", body: "b" }, author);
    expect(syncSlug).toHaveBeenCalled();
  });

  test("a post removed mid-flight is a 409", async () => {
    vi.mocked(postsRepo.upsertByExternalId).mockResolvedValue(undefined as never);
    await expect(ingestContent({ slug: "x", title: "t", body: "b" }, author)).rejects.toMatchObject({ status: 409 });
  });
});

const existing = (overrides = {}) =>
  postRow({ id: "p1", authorId: "author", externalId: "doc-42", title: "Old", slug: "old", ...overrides });

describe("ingestContent (update)", () => {
  test("a partial update writes only the fields it carries", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing() as never);
    const out = await ingestContent({ slug: "doc-42", title: "New" }, author);
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { title: "New" });
    expect(out).toEqual({ id: "p1", slug: "doc-42", status: "published", created: false });
    expect(queue.add).toHaveBeenCalledWith("federate_post", { postId: "p1", action: "update" });
  });

  test("a tags-only update touches no post column", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing() as never);
    await ingestContent({ slug: "doc-42", tags: [] }, author);
    expect(postsRepo.update).not.toHaveBeenCalled();
    expect(tagsRepo.setPostTags).toHaveBeenCalledWith("p1", []);
  });

  test("a new body re-derives the summary and clears the editor document", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing({ contentJson: { type: "doc" } }) as never);
    await ingestContent({ slug: "doc-42", body: "Fresh body." }, author);
    const fields = vi.mocked(postsRepo.update).mock.calls[0][1];
    expect(fields.contentJson).toBe(null);
    expect(fields.summary).toContain("Fresh body.");
  });

  test("clearing the description re-derives it from the stored body", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing({ contentHtml: "<p>Stored body.</p>" }) as never);
    await ingestContent({ slug: "doc-42", description: null }, author);
    expect(vi.mocked(postsRepo.update).mock.calls[0][1].summary).toContain("Stored body.");
  });

  test("banner: null drops the cover and its credit", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing() as never);
    await ingestContent({ slug: "doc-42", banner: null }, author);
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { coverUrl: null, coverCredit: null });
  });

  test("unpublishing tombstones the federated copies", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing() as never);
    await ingestContent({ slug: "doc-42", status: "draft" }, author);
    expect(queue.add).toHaveBeenCalledWith("federate_post_delete", { postId: "p1", authorId: "author" });
  });

  test("publishing a staged draft dates it now and federates a Create", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing({ status: "draft" }) as never);
    await ingestContent({ slug: "doc-42", status: "published" }, author);
    expect(postsRepo.update).toHaveBeenCalledWith("p1", { status: "published", createdAt: NOW });
    expect(queue.add).toHaveBeenCalledWith("federate_post", { postId: "p1", action: "create" });
  });

  test("a slug owned by a remote post is a 409", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing({ remote: true }) as never);
    await expect(ingestContent({ slug: "doc-42", title: "x" }, author)).rejects.toMatchObject({ status: 409 });
  });

  test("an unchanged title keeps the slug without re-syncing", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing() as never);
    vi.mocked(postsRepo.update).mockImplementation(async (_id, data) => ({ ...existing(), ...data }) as never);
    await ingestContent({ slug: "doc-42", body: "b" }, author);
    expect(syncSlug).not.toHaveBeenCalled();
  });

  // BUG: tags are validated (resolveTags caps them at 5, while the payload
  // schema allows 50) only after the post has been written. A delivery with a
  // new body and six tags answers 400 — and the body is already saved.
  test.fails("BUG: too many tags are refused before the post is written", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(existing() as never);
    await ingestContent({ slug: "doc-42", body: "new", tags: ["a", "b", "c", "d", "e", "f"] }, author).catch(() => {});
    expect(postsRepo.update).not.toHaveBeenCalled();
  });

  // BUG: a post scheduled in the editor carries a publishAt; when the CMS then
  // sets it to draft or published, ingestContent changes the status but leaves
  // publishAt, which the database's status/publish_at check constraint rejects
  // — the delivery fails with a 500 instead of clearing the schedule as
  // posts.updatePost does.
  test.fails("BUG: changing the status of a scheduled post clears its publish time", async () => {
    vi.mocked(postsRepo.findByExternalId).mockResolvedValue(
      existing({ status: "scheduled", publishAt: new Date("2026-07-01T00:00:00Z") }) as never,
    );
    await ingestContent({ slug: "doc-42", status: "published" }, author);
    expect(vi.mocked(postsRepo.update).mock.calls[0][1]).toMatchObject({ publishAt: null });
  });

  // BUG: posts.createPost/updatePost queue `indexnow_submit` whenever a post is
  // published or edited; the webhook path, which says it mirrors them, never
  // does — ingested posts are invisible to IndexNow.
  test.fails("BUG: a published ingest is submitted to IndexNow like an editor publish", async () => {
    await ingestContent({ slug: "doc-1", title: "t", body: "b" }, author);
    expect(queue.add).toHaveBeenCalledWith("indexnow_submit", { postId: "new" });
  });
});
