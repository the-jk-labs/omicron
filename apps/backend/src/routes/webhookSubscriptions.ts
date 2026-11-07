// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import { forbidden } from "@/lib/http.ts";
import type { Reply } from "@/lib/reply.ts";
import { jsonBody } from "@/lib/validate.ts";
import { requireUser } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as webhookSubscriptions from "@/services/webhookSubscriptions.ts";

export const webhookSubscriptionRoutes = new Hono<AppEnv>();

// The grant is what the account owner approved and can revoke, so a browser
// session or app JWT, which has no grant, has nothing to attach this to.
webhookSubscriptionRoutes.post("/", jsonBody(z.object({ url: z.string() })), async (c) => {
  const user = requireUser(c);
  const grant = c.get("oauthGrant");
  if (!grant) throw forbidden("Only an authorized OAuth application can subscribe.");
  const { id, url, secret } = await webhookSubscriptions.subscribe(grant, user, c.req.valid("json").url);
  return c.json({ id, url, secret } satisfies Reply<"WebhookSubscription">, 201);
});
