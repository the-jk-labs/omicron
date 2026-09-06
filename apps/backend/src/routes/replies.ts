// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { repliesPayload } from "@/federation/note.ts";
import { federationOrigin } from "@/services/federationState.ts";

// A post's Replies collection as plain JSON-LD. Mounted ahead of the Fedify
// middleware (see app.ts) so this path answers here instead of 404ing inside
// Fedify, which owns no dispatcher for it. Remote servers discover the URI
// from the Article's `replies` property and fetch it to render the thread.
export const repliesRoutes = new Hono();

repliesRoutes.get("/users/:identifier/posts/:postId/replies", async (c) => {
  const payload = await repliesPayload(federationOrigin(), c.req.param("identifier"), c.req.param("postId"));
  if (!payload) return c.notFound();
  return c.json(payload, 200, { "content-type": "application/activity+json" });
});
