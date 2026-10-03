// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import { jsonBody } from "@/lib/validate.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as emailChange from "@/services/emailChange.ts";

export const emailChangeRoutes = new Hono<AppEnv>();

// Public: the link arrives at the old address, whose owner may well be signed
// out by now. The token is the proof.
emailChangeRoutes.post("/undo", jsonBody(z.object({ token: z.string().min(1).max(200) })), async (c) => {
  const email = await emailChange.undoEmailChange(c.req.valid("json").token);
  return c.json({ email });
});
