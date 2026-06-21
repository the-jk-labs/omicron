import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import { SESSION_COOKIE } from "@/lib/session.ts";
import { unauthorized } from "@/lib/http.ts";
import type { AppEnv } from "@/routes/types.ts";

// Resolves the session cookie → user on every request (null if none).
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  c.set("user", token ? await sessionsRepo.findUser(token) : null);
  await next();
});

// Guard for routes that require authentication. Returns the user (non-null).
export function requireUser(c: { get: (k: "user") => AppEnv["Variables"]["user"] }) {
  const user = c.get("user");
  if (!user) throw unauthorized("You must be signed in.");
  return user;
}
