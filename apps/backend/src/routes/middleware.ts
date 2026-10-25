// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { matchedRoutes } from "hono/route";
import { auth } from "@/auth/auth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { badRequest, forbidden, unauthorized } from "@/lib/http.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import { OAuthError } from "@/lib/oauthError.ts";
import { clientAccess } from "@/routes/clientAccess.ts";
import type { AppEnv } from "@/routes/types.ts";
import { accessIdentity, requireSameOrigin } from "@/services/oauth.ts";
import { hasScope } from "@/services/oauthScopes.ts";

export const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function userFromJwt(headers: Headers) {
  const authorization = headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) return undefined;
  try {
    const { payload } = await auth.api.verifyJWT({ body: { token: match[1] } });
    return payload && typeof payload.sub === "string" ? await usersRepo.findById(payload.sub) : null;
  } catch {
    return null;
  }
}

// Resolves the Better Auth session → full user row on every request (null if
// none). Loading the row (not just the session's user) keeps the whole `User`
// shape — isAdmin, isModerator, isPrivate, suspendedAt, deletedAt, actorKeyPair — available downstream.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  if (/^Bearer\s+omi_(?:id|at|rt)_/i.test(c.req.header("authorization") ?? "")) {
    const { user, grant } = await accessIdentity(c.req.raw.headers);
    const route = matchedRoutes(c).find((candidate) => candidate.method !== "ALL");
    const access = route ? clientAccess(c.req.method, route.path) : undefined;
    if (!access?.scope || grant.scopes === "read:accounts" || !hasScope(grant.scopes, access.scope)) {
      throw new OAuthError(
        "insufficient_scope",
        "This application is not authorized for this endpoint.",
        403,
        access?.scope ?? undefined,
      );
    }
    c.set("user", user);
    c.set("oauthScopes", grant.scopes);
    c.header("Cache-Control", "no-store");
    await next();
    return;
  }
  // Better Auth's cookie cache can outlive a revoked session by up to 5 minutes.
  // The identity every page load asks for, and every write, go to the database.
  const authoritative = !READ_METHODS.has(c.req.method) || c.req.path === "/api/me";
  const jwtUser = await userFromJwt(c.req.raw.headers);
  const session =
    jwtUser === undefined
      ? await auth.api.getSession({
          headers: c.req.raw.headers,
          query: { disableCookieCache: authoritative },
        })
      : null;
  const user = jwtUser === undefined ? (session ? await usersRepo.findById(session.user.id) : null) : jwtUser;
  // A suspended or deleted account is treated as signed out at once, regardless
  // of the session cookie cache (its sign-in is also blocked in auth/auth.ts).
  c.set("user", user && !user.suspendedAt && !user.deletedAt ? user : null);
  // Cookie writes retain their CSRF boundary when Caddy bypasses SvelteKit.
  if (session && c.get("user") && !READ_METHODS.has(c.req.method)) {
    await requireSameOrigin(c.req.raw.headers);
  }
  await next();
});

export function mayModerate(c: Context<AppEnv>) {
  const user = requireUser(c);
  const scopes = c.get("oauthScopes");
  return (user.isAdmin || user.isModerator) && (!scopes || hasScope(scopes, "admin:write"));
}

// Guard for routes that require authentication. Returns the user (non-null).
export function requireUser(c: { get: (k: "user") => AppEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user) throw unauthorized("You must be signed in.");
  return user;
}

// Guard for moderation routes (users / posts / reports operations). Admins
// implicitly hold every moderator power. Returns the moderator user.
export function requireModerator(c: { get: (k: "user") => AppEnv["Variables"]["user"] }) {
  const user = requireUser(c);
  if (!user.isAdmin && !user.isModerator) throw forbidden("Moderator access required.");
  return user;
}

// Guard for instance-administration routes (settings, email, federation,
// domains, SEO, media, role grants). Moderators are refused here. Returns the
// admin user.
export function requireAdmin(c: { get: (k: "user") => AppEnv["Variables"]["user"] }) {
  const user = requireUser(c);
  if (!user.isAdmin) throw forbidden("Admin access required.");
  return user;
}

// A raw upload body, read only up to `max`: an oversized one is refused by its
// declared length, or as soon as the stream passes the cap, rather than being
// buffered whole first. The services re-check the exact limit.
export async function readUpload(c: Context<AppEnv>, max: number, tooLarge: string): Promise<Uint8Array> {
  if (Number(c.req.header("content-length")) > max) throw badRequest(tooLarge);
  const bytes = await readCappedBody(c.req.raw, max);
  if (!bytes) throw badRequest(tooLarge);
  return bytes;
}
