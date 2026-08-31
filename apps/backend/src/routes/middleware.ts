// SPDX-License-Identifier: AGPL-3.0-or-later
import { createMiddleware } from "hono/factory";
import { auth } from "@/auth/auth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { forbidden, unauthorized } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

// Resolves the Better Auth session → full user row on every request (null if
// none). Loading the row (not just the session's user) keeps the whole `User`
// shape — isAdmin, isPrivate, suspendedAt, actorKeyPair — available downstream.
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session ? ((await usersRepo.findById(session.user.id)) ?? null) : null);
  await next();
});

// Guard for routes that require authentication. Returns the user (non-null).
export function requireUser(c: { get: (k: "user") => AppEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user) throw unauthorized("You must be signed in.");
  return user;
}

// Guard for instance-administration routes (moderators). Returns the admin user.
export function requireAdmin(c: { get: (k: "user") => AppEnv["Variables"]["user"] }) {
  const user = requireUser(c);
  if (!user.isAdmin) throw forbidden("Moderator access required.");
  return user;
}
