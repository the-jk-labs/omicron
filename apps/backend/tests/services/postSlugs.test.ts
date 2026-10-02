// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/posts.ts"));

import * as postsRepo from "@/db/repositories/posts.ts";
import { backfillSlugs, syncSlug } from "@/services/postSlugs.ts";

const post = (
  overrides: Partial<{ id: string; authorId: string | null; title: string | null; slug: string | null }>,
) => ({
  id: "9e962281-0000-4000-8000-000000000000",
  authorId: "author",
  title: "Hello World",
  slug: null,
  ...overrides,
});

function taken(...slugs: string[]) {
  vi.mocked(postsRepo.slugsLike).mockResolvedValue(new Set(slugs));
}

beforeEach(() => {
  taken();
  vi.mocked(postsRepo.setSlug).mockResolvedValue(undefined);
});

describe("syncSlug", () => {
  test("assigns the slugified title", async () => {
    expect(await syncSlug(post({}))).toBe("hello-world");
    expect(postsRepo.slugsLike).toHaveBeenCalledWith("author", "hello-world", post({}).id);
    expect(postsRepo.setSlug).toHaveBeenCalledWith(post({}).id, "author", "hello-world");
  });

  test("takes the next free numeric suffix on a collision", async () => {
    taken("hello-world", "hello-world-2", "hello-world-3");
    expect(await syncSlug(post({}))).toBe("hello-world-4");
  });

  test("falls back to the short id once 50 suffixes are used", async () => {
    taken("hello-world", ...Array.from({ length: 49 }, (_, i) => `hello-world-${i + 2}`));
    expect(await syncSlug(post({}))).toBe("hello-world-9e962281");
  });

  test("re-saving a post whose title still matches its slug writes nothing", async () => {
    expect(await syncSlug(post({ slug: "hello-world" }))).toBe("hello-world");
    expect(postsRepo.setSlug).not.toHaveBeenCalled();
  });

  test("remote posts (no author) get no slug and no query", async () => {
    expect(await syncSlug(post({ authorId: null }))).toBe(null);
    expect(postsRepo.slugsLike).not.toHaveBeenCalled();
  });

  test.for([null, "", "!!!", "   "])("a title %j that slugifies to nothing keeps the existing slug", async (title) => {
    expect(await syncSlug(post({ title, slug: "old" }))).toBe("old");
    expect(await syncSlug(post({ title, slug: null }))).toBe(null);
    expect(postsRepo.setSlug).not.toHaveBeenCalled();
  });

  test("retries once with a fresh allocation when the insert loses a race", async () => {
    vi.mocked(postsRepo.slugsLike)
      .mockResolvedValueOnce(new Set())
      .mockResolvedValueOnce(new Set(["hello-world"]));
    vi.mocked(postsRepo.setSlug).mockRejectedValueOnce(new Error("unique violation"));
    expect(await syncSlug(post({}))).toBe("hello-world-2");
    expect(postsRepo.setSlug).toHaveBeenLastCalledWith(post({}).id, "author", "hello-world-2");
  });

  test("never throws: a persistent failure keeps the old slug", async () => {
    vi.mocked(postsRepo.setSlug).mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await syncSlug(post({ slug: "previous" }))).toBe("previous");
    expect(error).toHaveBeenCalled();
  });

  test("never throws when the lookup itself fails", async () => {
    vi.mocked(postsRepo.slugsLike).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await syncSlug(post({}))).toBe(null);
  });
});

describe("backfillSlugs", () => {
  test("does nothing (and logs nothing) when every post has a slug", async () => {
    vi.mocked(postsRepo.listWithoutSlug).mockResolvedValue([]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await backfillSlugs();
    expect(log).not.toHaveBeenCalled();
    expect(postsRepo.listWithoutSlug).toHaveBeenCalledWith(20_000);
  });

  test("assigns slugs sequentially and reports how many it gave", async () => {
    vi.mocked(postsRepo.listWithoutSlug).mockResolvedValue([
      post({ id: "a", title: "One" }),
      post({ id: "b", title: null }),
      post({ id: "c", title: "Two" }),
    ] as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await backfillSlugs();
    expect(vi.mocked(postsRepo.setSlug).mock.calls.map((c) => c[2])).toEqual(["one", "two"]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("Backfilled 2 post slug(s)"));
  });
});
