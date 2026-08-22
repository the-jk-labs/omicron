// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as searchService from "@/services/search.ts";
import { enrichPosts } from "@/services/engagement.ts";
import type { AppEnv } from "@/routes/types.ts";

export const searchRoutes = new Hono<AppEnv>();

// Site search (public). `?q=` is the query; `?scope=posts|people|tags` narrows
// the response, otherwise all three are returned. A blank query yields empty
// results. `?tag=` and `?author=` narrow the *posts* side only — the people/tags
// tabs still return the top matches for `q` alone, so tabs remain comparable.
searchRoutes.get("/", async (c) => {
  const viewer = c.get("user");
  const query = (c.req.query("q") ?? "").trim();
  const scope = c.req.query("scope");
  const tag = (c.req.query("tag") ?? "").trim() || undefined;
  const author = (c.req.query("author") ?? "").trim() || undefined;

  if (!query) return c.json({ posts: [], people: [], tags: [] });

  const wantPosts = !scope || scope === "posts";
  const wantPeople = !scope || scope === "people";
  const wantTags = !scope || scope === "tags";

  const [postRows, people, tags] = await Promise.all([
    wantPosts ? searchService.searchPosts(viewer?.id ?? null, query, { tag, author }) : Promise.resolve([]),
    wantPeople ? searchService.searchPeople(query) : Promise.resolve([]),
    wantTags ? searchService.searchTags(query) : Promise.resolve([]),
  ]);

  return c.json({
    posts: wantPosts ? await enrichPosts(postRows, viewer?.id ?? null) : [],
    people,
    tags,
  });
});
