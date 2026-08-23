// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import { decodeCursor } from "@/lib/pagination.ts";
import { jsonBody } from "@/lib/validate.ts";
import { requireUser } from "@/routes/middleware.ts";
import { readingListView } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";
import { enrichPosts } from "@/services/engagement.ts";
import * as listsService from "@/services/readingLists.ts";

export const listRoutes = new Hono<AppEnv>();

// Title/description limits and the read-later rules stay in
// services/readingLists.ts; this states the shape only. `visibility` is the one
// place a schema can say more than "a string" without duplicating a rule — the
// column itself is `"public" | "private"`.
const listSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional(),
});

// The signed-in user's own lists (all visibilities). Read-later is created
// lazily so it's always present.
listRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const lists = await listsService.myLists(user.id);
  return c.json({ lists: lists.map(readingListView) });
});

// Create a list (auth). Defaults to public unless `visibility: "private"`.
listRoutes.post("/", jsonBody(listSchema), async (c) => {
  const user = requireUser(c);
  const list = await listsService.createList(user.id, c.req.valid("json"));
  return c.json({ list: readingListView(list) }, 201);
});

// The signed-in user's read-later list meta. Registered before "/:id" so
// "read-later" isn't captured as a list id.
listRoutes.get("/read-later", async (c) => {
  const user = requireUser(c);
  const list = await listsService.readLater(user.id);
  return c.json({ list: readingListView(list) });
});

// A user's lists for their profile (public-only unless the viewer is the owner).
listRoutes.get("/user/:username", async (c) => {
  const viewer = c.get("user");
  const lists = await listsService.listsForProfile(c.req.param("username"), viewer?.id ?? null);
  return c.json({ lists: lists.map(readingListView) });
});

// Every list the signed-in user owns, each flagged whether it contains the post
// — powers the "Save to list" menu.
listRoutes.get("/for-post/:postId", async (c) => {
  const user = requireUser(c);
  const lists = await listsService.listsForPost(user.id, c.req.param("postId"));
  return c.json({ lists: lists.map(readingListView) });
});

// List meta + owner + whether the viewer owns it (public, or owner-only).
listRoutes.get("/:id", async (c) => {
  const viewer = c.get("user");
  const { list, isOwner, owner } = await listsService.getList(c.req.param("id"), viewer?.id ?? null);
  return c.json({ list: readingListView(list), isOwner, owner });
});

// A list's posts (paginated, newest-added first).
listRoutes.get("/:id/items", async (c) => {
  const viewer = c.get("user");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await listsService.listItems(c.req.param("id"), viewer?.id ?? null, cursor);
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// Edit a list (owner only).
listRoutes.patch("/:id", jsonBody(listSchema), async (c) => {
  const user = requireUser(c);
  const list = await listsService.updateList(user.id, c.req.param("id"), c.req.valid("json"));
  return c.json({ list: readingListView(list) });
});

// Delete a list (owner only; the read-later list can't be deleted).
listRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  await listsService.deleteList(user.id, c.req.param("id"));
  return c.json({ ok: true });
});

// Add / remove a post (owner only).
listRoutes.post("/:id/items", jsonBody(z.object({ postId: z.string() })), async (c) => {
  const user = requireUser(c);
  await listsService.addItem(user.id, c.req.param("id"), c.req.valid("json").postId);
  return c.json({ ok: true });
});

listRoutes.delete("/:id/items/:postId", async (c) => {
  const user = requireUser(c);
  await listsService.removeItem(user.id, c.req.param("id"), c.req.param("postId"));
  return c.json({ ok: true });
});
