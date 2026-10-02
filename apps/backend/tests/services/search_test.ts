// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import { remoteActorRow, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/remoteActors.ts"));
vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/db/repositories/users.ts"));

import * as postsRepo from "@/db/repositories/posts.ts";
import * as remoteActorsRepo from "@/db/repositories/remoteActors.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { searchPeople, searchPosts, searchTags } from "@/services/search.ts";

describe("searchPosts", () => {
  test("caps results at 20 and passes no filters by default", async () => {
    await searchPosts("viewer", "deno");
    expect(postsRepo.searchPosts).toHaveBeenCalledWith("viewer", "deno", 20, { tag: undefined, author: undefined });
  });

  test("normalizes the tag filter", async () => {
    await searchPosts(null, "q", { tag: "#Deno" });
    expect(postsRepo.searchPosts).toHaveBeenCalledWith(null, "q", 20, { tag: "deno", author: undefined });
  });

  test("a tag that normalizes to nothing means no tag filter", async () => {
    await searchPosts(null, "q", { tag: "###" });
    expect(postsRepo.searchPosts).toHaveBeenCalledWith(null, "q", 20, { tag: undefined, author: undefined });
  });

  test("trims the author filter and drops a blank one", async () => {
    await searchPosts(null, "q", { author: "  ada " });
    expect(postsRepo.searchPosts).toHaveBeenLastCalledWith(null, "q", 20, { tag: undefined, author: "ada" });
    await searchPosts(null, "q", { author: "   " });
    expect(postsRepo.searchPosts).toHaveBeenLastCalledWith(null, "q", 20, { tag: undefined, author: undefined });
  });
});

describe("searchPeople", () => {
  test("lists local accounts before cached remote actors, in one shape", async () => {
    vi.mocked(usersRepo.search).mockResolvedValue([userRow({ id: "u1", username: "ada" })] as never);
    vi.mocked(remoteActorsRepo.search).mockResolvedValue([
      remoteActorRow({ id: "a1", handle: "ada@x.example", displayName: "" }),
    ] as never);
    const people = await searchPeople("ada");
    expect(people.map((p) => [p.username, p.remote])).toEqual([
      ["ada", false],
      ["ada@x.example", true],
    ]);
    // A remote actor with no display name falls back to its handle.
    expect(people[1].displayName).toBe("ada@x.example");
    expect(usersRepo.search).toHaveBeenCalledWith("ada", 10);
    expect(remoteActorsRepo.search).toHaveBeenCalledWith("ada", 10);
  });

  test("never leaks a local user's email into results", async () => {
    vi.mocked(usersRepo.search).mockResolvedValue([userRow({ email: "secret@example.test" })] as never);
    vi.mocked(remoteActorsRepo.search).mockResolvedValue([]);
    expect(JSON.stringify(await searchPeople("ada"))).not.toContain("secret@example.test");
  });
});

describe("searchTags", () => {
  test("searches by the normalized slug", async () => {
    vi.mocked(tagsRepo.search).mockResolvedValue([{ slug: "fediverse", name: "Fediverse" }] as never);
    expect(await searchTags("#Fediverse")).toEqual([{ slug: "fediverse", name: "Fediverse" }]);
    expect(tagsRepo.search).toHaveBeenCalledWith("fediverse", 10);
  });

  test.for(["", "   ", "#", "!!!"])("an all-punctuation query %j finds nothing without a query", async (q) => {
    expect(await searchTags(q)).toEqual([]);
    expect(tagsRepo.search).not.toHaveBeenCalled();
  });
});
