// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as authService from "@/services/auth.ts";
import * as sessionsRepo from "@/db/repositories/sessions.ts";
import * as tagsRepo from "@/db/repositories/tags.ts";
import * as usersService from "@/services/users.ts";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session.ts";
import { config } from "@/config.ts";
import { requireUser } from "@/routes/middleware.ts";
import { rateLimit } from "@/lib/rateLimit.ts";
import { privateUser, profileLinkView } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

export const authRoutes = new Hono<AppEnv>();

// Per-IP throttles on the credential surface. Login is capped to blunt password
// brute-forcing; registration is capped harder to slow automated sign-up spam.
const loginLimiter = rateLimit({
  name: "auth-login",
  windowMs: 15 * 60_000,
  max: config.RL_LOGIN_MAX,
});
const registerLimiter = rateLimit({
  name: "auth-register",
  windowMs: 60 * 60_000,
  max: config.RL_REGISTER_MAX,
});
// Endpoints that trigger an outbound email (reset request, verification resend)
// are capped per IP to prevent using us as a mail-flood relay. Reuses the
// register budget (a few per hour is plenty for a human).
const emailSendLimiter = rateLimit({
  name: "auth-email-send",
  windowMs: 60 * 60_000,
  max: config.RL_REGISTER_MAX,
});
// Token-redemption endpoints (reset confirm, email verify) are capped per IP to
// blunt brute-forcing of tokens. Reuses the login budget.
const tokenLimiter = rateLimit({
  name: "auth-token",
  windowMs: 15 * 60_000,
  max: config.RL_LOGIN_MAX,
});

const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax" as const,
  path: "/",
  secure: !config.APP_DOMAIN.startsWith("localhost"),
  maxAge: SESSION_TTL_MS / 1000,
};

authRoutes.post("/register", registerLimiter, async (c) => {
  const body = await c.req.json();
  const user = await authService.register(body);
  const { token } = await authService.login(user.username, body.password);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);
  return c.json({ user: privateUser(user) }, 201);
});

authRoutes.post("/login", loginLimiter, async (c) => {
  const { identifier, password } = await c.req.json();
  const { user, token } = await authService.login(identifier, password);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);
  return c.json({ user: privateUser(user, await tagsRepo.tagsForUser(user.id)) });
});

// Request a password-reset email. Always 200 with the same body whether or not
// the identifier matches an account (no user enumeration).
authRoutes.post("/password/forgot", emailSendLimiter, async (c) => {
  const { identifier } = await c.req.json().catch(() => ({ identifier: "" }));
  await authService.requestPasswordReset(String(identifier ?? ""));
  return c.json({ ok: true });
});

// Complete a password reset with the emailed token.
authRoutes.post("/password/reset", tokenLimiter, async (c) => {
  const { token, password } = await c.req.json().catch(() => ({}));
  await authService.resetPassword(String(token ?? ""), String(password ?? ""));
  return c.json({ ok: true });
});

// Confirm an email address from the emailed token.
authRoutes.post("/email/verify", tokenLimiter, async (c) => {
  const { token } = await c.req.json().catch(() => ({}));
  await authService.verifyEmail(String(token ?? ""));
  return c.json({ ok: true });
});

// Re-send a verification email. Always 200 with the same body (no enumeration).
authRoutes.post("/email/resend", emailSendLimiter, async (c) => {
  const { email } = await c.req.json().catch(() => ({ email: "" }));
  await authService.resendVerification(String(email ?? ""));
  return c.json({ ok: true });
});

// Change the signed-in user's password (requires their current password).
authRoutes.post("/password/change", async (c) => {
  const user = requireUser(c);
  const { currentPassword, newPassword } = await c.req.json().catch(() => ({}));
  await authService.changePassword(
    user.id,
    String(currentPassword ?? ""),
    String(newPassword ?? ""),
  );
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await sessionsRepo.remove(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  const [tags, links] = await Promise.all([
    tagsRepo.tagsForUser(user.id),
    usersService.profileLinks(user.id),
  ]);
  return c.json({ user: privateUser(user, tags, links.map(profileLinkView)) });
});

// Permanently delete the signed-in account (requires the current password).
authRoutes.delete("/me", async (c) => {
  const user = requireUser(c);
  const { password } = await c.req.json().catch(() => ({ password: "" }));
  await authService.deleteAccount(user.id, password ?? "");
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
