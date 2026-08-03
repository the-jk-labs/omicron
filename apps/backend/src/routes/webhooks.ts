// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as webhooks from "@/services/webhooks.ts";
import { parseContent } from "@/lib/webhook.ts";
import { badRequest } from "@/lib/http.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { config } from "@/config.ts";
import type { AppEnv } from "@/routes/types.ts";

export const webhookRoutes = new Hono<AppEnv>();

// Machine callers carry no session, so the app-wide write limiter buckets them
// all by IP. A CMS publishing a batch is legitimately bursty but never fast, so
// a tighter per-IP cap sits on top: enough headroom for a bulk re-sync, far too
// little for anyone probing the secret.
const ingestLimiter = rateLimit({
  name: "webhook-content",
  windowMs: 60_000,
  max: config.RL_WEBHOOK_MAX,
});

/**
 * Ingest a document from an external content system and publish it as a post.
 *
 *   POST /api/webhooks/content
 *   X-Webhook-Secret: <WEBHOOK_SECRET>      (or: Authorization: Bearer <…>)
 *   { "title": …, "body": <markdown>, "description"?: …, "banner"?: <url> }
 *
 * 201 when the document is new, 200 when it updated one this webhook had
 * already published (keyed by `slug`, or the title's slug when none is sent).
 * 400 names the offending field, 401 means the token is wrong, 503 means the
 * instance has no `WEBHOOK_SECRET` set and the endpoint is switched off.
 *
 * Errors never carry the secret: the service compares it without ever putting
 * it in a message, and `handleError` (app.ts) is the only thing that logs, so
 * a 500 records the failure and not the credentials.
 */
webhookRoutes.post("/content", ingestLimiter, async (c) => {
  await webhooks.authenticate(c.req.raw.headers);

  // Buffer under a hard cap before parsing, so a missing or spoofed
  // Content-Length can't stream an unbounded body into JSON.parse.
  const raw = await readCappedBody(c.req.raw, config.WEBHOOK_MAX_BODY_BYTES);
  if (raw === null) return c.json({ error: "Payload too large." }, 413);

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw badRequest("Body must be valid JSON.");
  }

  const result = await webhooks.ingestContent(parseContent(json));
  return c.json(result, result.created ? 201 : 200);
});
