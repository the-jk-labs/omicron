// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import type { Context } from "hono";
import { handleError } from "@/lib/http.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as oauth from "@/services/oauth.ts";

function parameters(params: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) throw new oauth.OAuthError("invalid_request", `Duplicate parameter: ${key}.`);
    result[key] = value;
  }
  return result;
}

async function body(c: Context): Promise<Record<string, unknown>> {
  const raw = await readCappedBody(c.req.raw, 16_384);
  if (!raw) throw new oauth.OAuthError("invalid_request", "Request body is too large.", 413);
  const value = new TextDecoder().decode(raw);
  const type = c.req.header("content-type")?.split(";")[0].trim().toLowerCase();
  if (type === "application/x-www-form-urlencoded") return parameters(new URLSearchParams(value));
  if (type !== "application/json")
    throw new oauth.OAuthError("invalid_request", "Use JSON or form-encoded parameters.", 415);
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new oauth.OAuthError("invalid_request", "Invalid JSON object.");
  }
}

// Isolated from the normal API's JWT/session middleware and its write permissions.
export const oauthRoutes = new Hono<AppEnv>();
for (const path of [
  "/api/v1/apps",
  "/api/v1/apps/verify_credentials",
  "/api/v1/accounts/verify_credentials",
  "/api/oauth/*",
  "/oauth/token",
  "/oauth/revoke",
  "/.well-known/oauth-authorization-server",
])
  oauthRoutes.use(path, async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Pragma", "no-cache");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    await next();
  });
oauthRoutes.onError((err, c) => {
  if (!(err instanceof oauth.OAuthError)) return handleError(err, c);
  const response = handleError(err, c);
  if (err.status === 401 && err.error === "invalid_client")
    response.headers.set("WWW-Authenticate", 'Basic realm="Omicron OAuth"');
  return response;
});

const limited = (name: string, max: number, windowMs = 60_000) => rateLimit({ name, max, windowMs });

async function clientBody(c: Context) {
  const input = await body(c);
  const authorization = c.req.header("authorization");
  if (!authorization) return input;
  if (input.client_id !== undefined || input.client_secret !== undefined)
    throw new oauth.OAuthError("invalid_request", "Use only one client authentication method.");
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) throw new oauth.OAuthError("invalid_client", "Invalid client authentication.", 401);
  try {
    const decoded = atob(match[1]);
    const colon = decoded.indexOf(":");
    if (colon < 0) throw new Error();
    return {
      ...input,
      client_id: decodeCredential(decoded.slice(0, colon)),
      client_secret: decodeCredential(decoded.slice(colon + 1)),
    };
  } catch {
    throw new oauth.OAuthError("invalid_client", "Invalid client authentication.", 401);
  }
}

const decodeCredential = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));

oauthRoutes.get("/.well-known/oauth-authorization-server", async (c) => c.json(await oauth.metadata()));

oauthRoutes.post("/api/v1/apps", limited("oauth-register", 10, 3600_000), async (c) =>
  c.json(await oauth.register(await body(c)), 200),
);
oauthRoutes.get("/api/v1/apps/verify_credentials", limited("oauth-app", 120), async (c) =>
  c.json(await oauth.verifyApp(c.req.raw.headers)),
);

// The HTML consent page is /oauth/authorize in SvelteKit; these are its JSON backing routes.
oauthRoutes.get("/api/oauth/authorize", limited("oauth-consent", 30), async (c) =>
  c.json(await oauth.prepare(parameters(new URL(c.req.url).searchParams), c.req.raw.headers)),
);
oauthRoutes.post("/api/oauth/authorize", limited("oauth-decision", 30), async (c) =>
  c.json({ redirect: await oauth.decide(await body(c), c.req.raw.headers) }),
);

oauthRoutes.post("/oauth/token", limited("oauth-token", 60), async (c) =>
  c.json(await oauth.exchange(await clientBody(c))),
);
oauthRoutes.post("/oauth/revoke", limited("oauth-revoke", 60), async (c) => {
  await oauth.revoke(await clientBody(c));
  return c.json({});
});
oauthRoutes.get("/api/v1/accounts/verify_credentials", limited("oauth-identity", 120), async (c) =>
  c.json(await oauth.verify(c.req.raw.headers)),
);
oauthRoutes.get("/api/oauth/connections", limited("oauth-connections", 60), async (c) =>
  c.json({ connections: await oauth.connections(c.req.raw.headers) }),
);
oauthRoutes.delete("/api/oauth/connections/:id", limited("oauth-disconnect", 30), async (c) => {
  await oauth.disconnect(c.req.param("id"), c.req.raw.headers);
  return c.json({ ok: true });
});
