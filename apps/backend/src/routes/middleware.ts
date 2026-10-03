// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "@/auth/auth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { badRequest, forbidden, unauthorized } from "@/lib/http.ts";
import { readCappedBody } from "@/lib/inboxBody.ts";
import type { AppEnv } from "@/routes/types.ts";

export const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Resolves the Better Auth session → full user row on every request (null if
// none). Loading the row (not just the session's user) keeps the whole `User`
// shape — isAdmin, isModerator, isPrivate, suspendedAt, deletedAt, actorKeyPair — available downstream.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // Better Auth's cookie cache can outlive a revoked session by up to 5 minutes.
  // The identity every page load asks for, and every write, go to the database.
  const authoritative = !READ_METHODS.has(c.req.method) || c.req.path === "/api/me";
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: authoritative },
  });
  const user = session ? await usersRepo.findById(session.user.id) : null;
  // A suspended or deleted account is treated as signed out at once, regardless
  // of the session cookie cache (its sign-in is also blocked in auth/auth.ts).
  c.set("user", user && !user.suspendedAt && !user.deletedAt ? user : null);
  await next();
});

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
