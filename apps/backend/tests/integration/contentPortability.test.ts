// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterAll, beforeEach, expect, test, vi } from "vitest";
import * as repo from "@/db/repositories/contentPortability.ts";
import * as tags from "@/db/repositories/tags.ts";
import { closeDb, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "./harness.ts";

beforeEach(resetDb);
afterAll(closeDb);

test("export selects only the owner's local content, including drafts and schedules", async () => {
  const owner = await mkUser("writer");
  const other = await mkUser("other");
  await mkPost(owner.id, "live");
  await mkPost(owner.id, "draft", { status: "draft" });
  await mkPost(owner.id, "later", { status: "scheduled" });
  await mkPost(other.id, "unrelated");
  const remote = await mkRemoteActor("remote@elsewhere.test");
  await mkRemotePost(remote.id, "remote-story");
  expect((await repo.listOwn(owner.id, 1001)).map((post) => post.title)).toEqual(["live", "draft", "later"]);
  expect(await repo.identities(owner.id)).toHaveLength(3);
});

test("concurrent retries insert once, keep tags, and cannot overwrite an existing post", async () => {
  const owner = await mkUser("writer");
  const data = {
    authorId: owner.id,
    externalId: "portability:test",
    contentHtml: "<p>Original</p>",
    title: "Original",
    status: "draft" as const,
  };
  const results = await Promise.all([repo.insertPost(data, ["tech"]), repo.insertPost(data, ["tech"])]);
  expect(results.filter(Boolean)).toHaveLength(1);
  const post = results.find(Boolean)!;
  expect(await tags.tagsForPost(post.id)).toEqual([{ slug: "tech", name: "tech" }]);
  expect(await repo.insertPost({ ...data, contentHtml: "<p>Overwrite</p>" }, ["new"])).toBeNull();
  expect((await repo.listOwn(owner.id, 10))[0].contentHtml).toBe("<p>Original</p>");
  expect(await tags.tagsForPost(post.id)).toEqual([{ slug: "tech", name: "tech" }]);
});

test("identical source identities are independent for different users", async () => {
  const first = await mkUser("first");
  const second = await mkUser("second");
  for (const user of [first, second])
    expect(
      await repo.insertPost({ authorId: user.id, externalId: "same", contentHtml: "<p>Body</p>", status: "draft" }, []),
    ).not.toBeNull();
  expect(await repo.identities(first.id)).toHaveLength(1);
  expect(await repo.identities(second.id)).toHaveLength(1);
});

test("a tag write failure rolls back the post, allowing a complete retry", async () => {
  const owner = await mkUser("writer");
  const data = { authorId: owner.id, externalId: "retry", contentHtml: "<p>Body</p>", status: "draft" as const };
  const resolve = vi.spyOn(tags, "resolveSlugs").mockResolvedValueOnce(["invalid\0tag"]);
  try {
    await expect(repo.insertPost(data, ["tech"])).rejects.toThrow(/insert into "tags"/);
  } finally {
    resolve.mockRestore();
  }
  expect(await repo.identities(owner.id)).toHaveLength(0);
  expect(await repo.insertPost(data, ["tech"])).not.toBeNull();
});
