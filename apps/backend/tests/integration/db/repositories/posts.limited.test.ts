// SPDX-License-Identifier: AGPL-3.0-or-later
// A limited domain (blocked_domains.severity = 'limit') keeps federating but
// stays off the discovery surfaces: Global, Trending and the global random pick.
import { afterAll, beforeEach, expect, test } from "vitest";
import * as blockedDomainsRepo from "@/db/repositories/blockedDomains.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import { closeDb, mkPost, mkRemoteActor, mkRemotePost, mkUser, resetDb } from "../../harness.ts";

afterAll(closeDb);
beforeEach(resetDb);

async function seed() {
  const local = await mkUser("ada");
  await mkPost(local.id, "local-post");
  const fine = await mkRemoteActor("bob@fine.example");
  const noisy = await mkRemoteActor("eve@blog.noisy.example:8443");
  await mkRemotePost(fine.id, "https://fine.example/p/1");
  const hidden = await mkRemotePost(noisy.id, "https://blog.noisy.example:8443/p/1");
  return { noisy, hidden };
}

const titles = async () => (await postsRepo.listGlobal(null, null)).map(({ post }) => post.title ?? "").toSorted();

test("Global hides posts from a limited domain, its subdomains and ports", async () => {
  const { hidden } = await seed();
  expect(await titles()).toContain(hidden.title);
  await blockedDomainsRepo.upsert("noisy.example", "", "limit");
  expect(await titles()).not.toContain(hidden.title);
  expect(await titles()).toContain("https://fine.example/p/1");
});

test("Trending and the global random pick skip it too, but the profile still lists it", async () => {
  const { noisy, hidden } = await seed();
  await blockedDomainsRepo.upsert("noisy.example", "", "limit");
  const trending = await postsRepo.listTrending(null, 50);
  expect(trending.map(({ post }) => post.id)).not.toContain(hidden.id);
  for (let i = 0; i < 10; i++) {
    expect((await postsRepo.findRandom("global", null, null))?.post.id).not.toBe(hidden.id);
  }
  const profile = await postsRepo.listByRemoteActor(noisy.id, null, null);
  expect(profile.map(({ post }) => post.id)).toContain(hidden.id);
});
