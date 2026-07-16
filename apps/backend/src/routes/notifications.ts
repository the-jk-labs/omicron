// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as notifications from "@/services/notifications.ts";
import { decodeCursor } from "@/lib/pagination.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

export const notificationRoutes = new Hono<AppEnv>();

// The signed-in user's notifications, newest first, cursor-paginated.
notificationRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const cursor = decodeCursor(c.req.query("cursor"));
  return c.json(await notifications.list(user.id, cursor));
});

// Unread count for the bell badge — polled by the client.
notificationRoutes.get("/unread-count", async (c) => {
  const user = requireUser(c);
  return c.json({ count: await notifications.unreadCount(user.id) });
});

// Mark every notification read (opening the dropdown / visiting the page).
notificationRoutes.post("/read", async (c) => {
  const user = requireUser(c);
  await notifications.markAllRead(user.id);
  return c.json({ ok: true });
});

// Mark a single notification read.
notificationRoutes.post("/:id/read", async (c) => {
  const user = requireUser(c);
  await notifications.markRead(user.id, c.req.param("id"));
  return c.json({ ok: true });
});
