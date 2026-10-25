// SPDX-License-Identifier: AGPL-3.0-or-later
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "@/routes/types.ts";

const corsHandler = cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type"],
  exposeHeaders: ["WWW-Authenticate", "Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset"],
  maxAge: 600,
});

// Browser clients use bearer tokens, never cross-origin session cookies or browser consent.
export const clientCors = createMiddleware<AppEnv>((c, next) => {
  const path = c.req.path;
  const api = path.startsWith("/api/") && !/^\/api\/(?:auth|oauth|setup|email-change)(?:\/|$)/.test(path);
  return api || ["/oauth/token", "/oauth/revoke", "/.well-known/oauth-authorization-server"].includes(path)
    ? corsHandler(c, next)
    : next();
});
