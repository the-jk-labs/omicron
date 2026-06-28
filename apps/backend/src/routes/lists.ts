// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as listsService from "@/services/readingLists.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import { readingListView } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

export const listRoutes = new Hono<AppEnv>();

// The signed-in user's own lists (all visibilities). Read-later is created
// lazily so it's always present.
listRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const lists = await listsService.myLists(user.id);
  return c.json({ lists: lists.map(readingListView) });
});

// Create a list (auth). Defaults to public unless `visibility: "private"`.
listRoutes.post("/", async (c) => {
  const user = requireUser(c);
  const body = await c.req.json();
  const list = await listsService.createList(user.id, body);
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
  const { list, isOwner, owner } = await listsService.getList(
    c.req.param("id"),
    viewer?.id ?? null,
  );
  return c.json({ list: readingListView(list), isOwner, owner });
});

// A list's posts (paginated, newest-added first).
listRoutes.get("/:id/items", async (c) => {
  const viewer = c.get("user");
  const cursor = decodeCursor(c.req.query("cursor"));
  const { items, nextCursor } = await listsService.listItems(
    c.req.param("id"),
    viewer?.id ?? null,
    cursor,
  );
  return c.json({ items: await enrichPosts(items, viewer?.id ?? null), nextCursor });
});

// Edit a list (owner only).
listRoutes.patch("/:id", async (c) => {
  const user = requireUser(c);
  const body = await c.req.json();
  const list = await listsService.updateList(user.id, c.req.param("id"), body);
  return c.json({ list: readingListView(list) });
});

// Delete a list (owner only; the read-later list can't be deleted).
listRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  await listsService.deleteList(user.id, c.req.param("id"));
  return c.json({ ok: true });
});

// Add / remove a post (owner only).
listRoutes.post("/:id/items", async (c) => {
  const user = requireUser(c);
  const { postId } = await c.req.json();
  await listsService.addItem(user.id, c.req.param("id"), postId);
  return c.json({ ok: true });
});

listRoutes.delete("/:id/items/:postId", async (c) => {
  const user = requireUser(c);
  await listsService.removeItem(user.id, c.req.param("id"), c.req.param("postId"));
  return c.json({ ok: true });
});
