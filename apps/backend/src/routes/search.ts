// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as searchService from "@/services/search.ts";
import { enrichPosts } from "@/services/engagement.ts";
import type { AppEnv } from "@/routes/types.ts";

export const searchRoutes = new Hono<AppEnv>();

// Site search (public). `?q=` is the query; `?scope=posts|people` narrows the
// response, otherwise both are returned. A blank query yields empty results.
searchRoutes.get("/", async (c) => {
  const viewer = c.get("user");
  const query = (c.req.query("q") ?? "").trim();
  const scope = c.req.query("scope");

  if (!query) return c.json({ posts: [], people: [] });

  const wantPosts = scope !== "people";
  const wantPeople = scope !== "posts";

  const [postRows, people] = await Promise.all([
    wantPosts ? searchService.searchPosts(viewer?.id ?? null, query) : Promise.resolve([]),
    wantPeople ? searchService.searchPeople(query) : Promise.resolve([]),
  ]);

  return c.json({
    posts: wantPosts ? await enrichPosts(postRows, viewer?.id ?? null) : [],
    people,
  });
});
