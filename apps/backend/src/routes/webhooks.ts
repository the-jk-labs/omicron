// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as webhooks from "@/services/webhooks.ts";
import * as webhookTokens from "@/services/webhookTokens.ts";
import { parseContent } from "@/lib/webhook.ts";
import { requireUser } from "@/routes/middleware.ts";
import { webhookTokenView } from "@/routes/serializers.ts";
import { badRequest } from "@/lib/http.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { config } from "@/config.ts";
import { jsonBody } from "@/lib/validate.ts";
import { z } from "zod";
import type { AppEnv } from "@/routes/types.ts";

export const webhookRoutes = new Hono<AppEnv>();

// Machine callers carry no session, so the app-wide write limiter buckets them
// all by IP. A CMS publishing a batch is legitimately bursty but never fast, so
// a tighter per-IP cap sits on top: enough headroom for a bulk re-sync, far too
// little for anyone probing a credential.
const ingestLimiter = rateLimit({
  name: "webhook-content",
  windowMs: 60_000,
  max: config.RL_WEBHOOK_MAX,
});

/**
 * Ingest a document from an external content system and publish it as a post.
 *
 *   POST /api/webhooks/content
 *   X-Webhook-Secret: <token>               (or: Authorization: Bearer <…>)
 *   { "title": …, "body": <markdown>, "description"?: …, "banner"?: <url> }
 *
 * The credential is either a per-user token minted below — the post is then
 * published as its owner — or the instance-wide `WEBHOOK_SECRET`.
 *
 * 201 when the document is new, 200 when it updated one the same author had
 * already published under that key (`slug`, or the title's slug when none is
 * sent). 400 names the offending field; 401 means the credential is unknown.
 *
 * An update is partial: it writes only the fields it carries, so
 * `{ "slug": "doc-42", "status": "draft" }` unpublishes a post without
 * resending its body, and `null` clears a field rather than leaving it. `title`
 * and `body` are required only on the delivery that creates the post — after
 * that, `slug` alone identifies it.
 *
 * Errors never carry the credential: the service compares it without ever
 * putting it in a message, and `handleError` (app.ts) is the only thing that
 * logs, so a 500 records the failure and not the token.
 */
webhookRoutes.post("/content", ingestLimiter, async (c) => {
  const author = await webhooks.authenticate(c.req.raw.headers);

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

  const result = await webhooks.ingestContent(parseContent(json), author);
  return c.json(result, result.created ? 201 : 200);
});

// ── Token management (session-authenticated) ────────────────────────────────
// These are ordinary signed-in API calls, not webhook calls: a writer manages
// their own publishing tokens from Settings. Every handler scopes to the
// session user, so one account can never see or revoke another's.

webhookRoutes.get("/tokens", async (c) => {
  const user = requireUser(c);
  const tokens = await webhookTokens.list(user.id);
  return c.json({ tokens: tokens.map(webhookTokenView) });
});

// Mint a token. The plaintext is in this response and nowhere else, ever —
// only its hash is stored, so it cannot be shown again.
webhookRoutes.post(
  "/tokens",
  // A label is optional — an unlabelled token is valid, and the service names
  // it. The body may be absent entirely, so the object itself gets a default.
  jsonBody(z.object({ label: z.string().optional() }).default({})),
  async (c) => {
    const user = requireUser(c);
    const { token, row } = await webhookTokens.mint(user.id, c.req.valid("json").label);
    return c.json({ token, tokenInfo: webhookTokenView(row) }, 201);
  },
);

webhookRoutes.delete("/tokens/:id", async (c) => {
  const user = requireUser(c);
  await webhookTokens.revoke(user.id, c.req.param("id"));
  return c.json({ ok: true });
});
