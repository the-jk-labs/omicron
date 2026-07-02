// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import * as moderation from "@/services/moderation.ts";
import { requireUser } from "@/routes/middleware.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import { config } from "@/config.ts";
import { badRequest } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

export const reportRoutes = new Hono<AppEnv>();

// Per-user cap so the moderation queue can't be spammed by a single account.
// Reuses the register budget (a few per hour is plenty for genuine flags).
const reportLimiter = rateLimit({
  name: "reports",
  windowMs: 60 * 60_000,
  max: config.RL_REGISTER_MAX,
});

const reportSchema = z.object({
  subjectType: z.enum(["post", "user"]),
  subjectId: z.string().uuid(),
  reason: z.string().max(1000).optional(),
});

// File a report against a post or an account. Signed-in users only.
reportRoutes.post("/", reportLimiter, async (c) => {
  const user = requireUser(c);
  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Expected { subjectType, subjectId, reason? }.");
  await moderation.report(user.id, parsed.data);
  return c.json({ ok: true }, 201);
});
