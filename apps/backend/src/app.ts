// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { logger } from "hono/logger";
import { config } from "@/config.ts";
import { federationRunning } from "@/services/federationState.ts";
import { handleError } from "@/lib/http.ts";
import { sessionMiddleware } from "@/routes/middleware.ts";
import { healthRoutes } from "@/routes/health.ts";
import { apiRoutes } from "@/routes/index.ts";
import { registerJobHandlers } from "@/queue/handlers.ts";
import { checkRateLimit, clientIp, rateLimit } from "@/lib/rateLimit.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import type { AppEnv } from "@/routes/types.ts";

// Read-only requests are cheap and safe; the general limiter targets mutations.
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Broad backstop on API writes: per signed-in user, or per IP for anonymous
// callers. Endpoint-specific limiters (e.g. auth) layer stricter caps on top.
const apiWriteLimiter = rateLimit({
  name: "api-write",
  windowMs: 60_000,
  max: config.RL_API_WRITE_MAX,
  key: (c) => {
    const user = c.get("user");
    return user ? `u:${user.id}` : `ip:${clientIp(c)}`;
  },
});

// The federation inbox accepts unauthenticated POSTs from arbitrary instances;
// cap per source IP so a hostile peer can't flood it. Generous, since a busy
// instance legitimately delivers many activities.
const INBOX_LIMIT = { name: "inbox", windowMs: 60_000, max: config.RL_INBOX_MAX };

// Caddy terminates TLS and proxies to this container over plain HTTP, so the
// request Fedify sees is always "http://...". Fedify builds every actor/object
// URI from that request, so left uncorrected every federated URL would be
// http:// even though the public site is https:// — trust x-forwarded-proto
// since Caddy (the `routes` block in Caddyfile) is the only hop in front of us.
//
// Returns just the corrected URL string — never touch `req.body` here. The
// POST path below already reads the body once (readCappedBody); constructing
// a `new Request(url, req)` from the same `req` a second time would try to
// read its body stream again and throw "ReadableStream is locked or disturbed".
function publicSchemeUrl(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto");
  const url = new URL(req.url);
  if (proto) url.protocol = proto;
  return url.toString();
}

// GET/HEAD federation requests have no body, so rebuilding the whole Request
// (to fix the scheme) is safe here.
function withPublicScheme(req: Request): Request {
  const fixed = publicSchemeUrl(req);
  return fixed === req.url ? req : new Request(fixed, req);
}

// Builds the fully-composed Hono app. Federation is mounted only when enabled,
// keeping the standalone blog free of any ActivityPub code paths.
export async function buildApp() {
  registerJobHandlers();

  const app = new Hono<AppEnv>();
  app.use("*", logger());
  app.onError(handleError);

  // Mount ActivityPub (WebFinger, actor, inbox/outbox) before app routes.
  // Federation paths are delegated to Fedify's fetch handler; everything else
  // falls through to the app's own routes.
  if (federationRunning()) {
    const { getFederation } = await import("@/federation/mod.ts");
    const fed = getFederation();
    const fedPrefixes = ["/.well-known/", "/users/", "/inbox", "/nodeinfo"];
    app.use("*", async (c, next) => {
      const path = new URL(c.req.url).pathname;
      if (fedPrefixes.some((p) => path === p || path.startsWith(p))) {
        // Throttle inbound activity delivery (POST); GET dispatchers (actor,
        // WebFinger, outbox) are cheap reads and left unthrottled here.
        if (c.req.method === "POST") {
          // Reject oversized payloads up front by their declared length, before
          // touching the body at all — the cheap first gate.
          const declaredLen = Number(c.req.header("content-length"));
          if (Number.isFinite(declaredLen) && declaredLen > config.INBOX_MAX_BODY_BYTES) {
            return new Response("Payload Too Large", { status: 413 });
          }
          const { allowed, retryAfter } = await checkRateLimit(c, INBOX_LIMIT);
          if (!allowed) {
            return new Response("Too Many Requests", {
              status: 429,
              headers: { "retry-after": String(retryAfter) },
            });
          }
          // Buffer the body under a hard cap so a missing/chunked/spoofed
          // Content-Length can't stream an unbounded payload into Fedify's
          // parser. We consume the stream, so rebuild the request from the
          // buffered bytes (headers/method/url preserved, so the HTTP-Signature
          // digest still verifies against the exact same bytes).
          const body = await readCappedBody(c.req.raw, config.INBOX_MAX_BODY_BYTES);
          if (body === null) return new Response("Payload Too Large", { status: 413 });
          const buffered = new Request(publicSchemeUrl(c.req.raw), {
            method: "POST",
            headers: c.req.raw.headers,
            // A Uint8Array is a valid runtime BodyInit; the DOM typing omits it.
            body: body as BodyInit,
          });
          return await fed.fetch(buffered, { contextData: undefined });
        }
        return await fed.fetch(withPublicScheme(c.req.raw), { contextData: undefined });
      }
      await next();
    });
    console.log("✔ Federation enabled (ActivityPub).");
  }

  app.route("/", healthRoutes);

  // Session resolution applies to the JSON API.
  app.use("/api/*", sessionMiddleware);
  // General write throttle, after session resolution so it can key by user.
  app.use(
    "/api/*",
    (c, next) => READ_METHODS.has(c.req.method) ? next() : apiWriteLimiter(c, next),
  );
  app.route("/api", apiRoutes);

  return app;
}
