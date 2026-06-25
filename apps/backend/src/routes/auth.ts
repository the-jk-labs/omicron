// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as authService from "@/services/auth.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session.ts";
import { config } from "@/config.ts";
import { requireUser } from "@/routes/middleware.ts";
import { publicUser } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

export const authRoutes = new Hono<AppEnv>();

const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax" as const,
  path: "/",
  secure: !config.APP_DOMAIN.startsWith("localhost"),
  maxAge: SESSION_TTL_MS / 1000,
};

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const user = await authService.register(body);
  const { token } = await authService.login(user.username, body.password);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);
  return c.json({ user: publicUser(user) }, 201);
});

authRoutes.post("/login", async (c) => {
  const { identifier, password } = await c.req.json();
  const { user, token } = await authService.login(identifier, password);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);
  return c.json({ user: publicUser(user) });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await sessionsRepo.remove(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", (c) => {
  const user = c.get("user");
  return c.json({ user: user ? publicUser(user) : null });
});

// Permanently delete the signed-in account (requires the current password).
authRoutes.delete("/me", async (c) => {
  const user = requireUser(c);
  const { password } = await c.req.json().catch(() => ({ password: "" }));
  await authService.deleteAccount(user.id, password ?? "");
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
