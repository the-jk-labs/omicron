// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import * as authService from "@/services/auth.ts";
import * as setup from "@/services/instanceSetup.ts";
import * as emailSettings from "@/services/emailSettings.ts";
import { sendTestEmail } from "@/services/email.ts";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session.ts";
import { config } from "@/config.ts";
import { badRequest, conflict } from "@/lib/http.ts";
import { privateUser } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";

// Session cookie attributes (kept in sync with routes/auth.ts). Secure unless
// running on a bare localhost domain, where there's no TLS to require.
const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax" as const,
  path: "/",
  secure: !config.APP_DOMAIN.startsWith("localhost"),
  maxAge: SESSION_TTL_MS / 1000,
};

// Public, unauthenticated snapshot of the instance's identity. Drives the
// frontend chrome (app name) and the first-run setup gate.
export const instanceRoutes = new Hono<AppEnv>();

instanceRoutes.get("/", async (c) => c.json(await setup.publicInfo()));

// Caddy on-demand TLS "ask" endpoint. Caddy calls this (over the internal
// network, before serving TLS) with ?domain=<sni>; a 2xx means "issue a
// certificate for this host". Kept tight so only this instance's own domain is
// ever provisioned — see services/instanceSetup.ts for the policy.
instanceRoutes.get("/tls-check", async (c) => {
  const domain = c.req.query("domain") ?? "";
  if (await setup.isTlsDomainAllowed(domain)) return c.text("ok");
  return c.text("not allowed", 403);
});

// The first-run setup wizard. Open (no auth) but single-shot: it only works
// while the instance is unconfigured, so it can never be used to hijack a
// running instance or mint a second admin.
export const setupRoutes = new Hono<AppEnv>();

// Web-managed email settings the wizard collects (mirrors the admin page). All
// fields optional: `console` needs none; `smtp` fills the connection details.
const emailInputSchema = z.object({
  mode: z.enum(["console", "smtp"]).optional(),
  from: z.string().trim().max(200).optional(),
  smtp: z.object({
    host: z.string().trim().max(255).optional(),
    port: z.coerce.number().int().positive().max(65535).optional(),
    username: z.string().trim().max(255).optional(),
    password: z.string().max(1024).optional(),
    tls: z.boolean().optional(),
  }).optional(),
}).optional();

const setupSchema = z.object({
  appName: z.string().trim().min(1, "An instance name is required.").max(100),
  // Optional: leave unset to keep the APP_DOMAIN env/default. No scheme/slashes.
  appDomain: z.string().trim().max(253).optional(),
  email: emailInputSchema,
  admin: z.object({
    username: z.string(),
    email: z.string().email("A valid admin email is required."),
    password: z.string(),
    displayName: z.string().optional(),
  }),
});

setupRoutes.post("/", async (c) => {
  // Guard BEFORE creating anything: once an admin exists, setup is closed.
  if (await setup.isSetupComplete()) {
    throw conflict("This instance has already been set up.");
  }

  const parsed = setupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid setup details.");
  }
  const { appName, appDomain, email, admin } = parsed.data;

  // Create the owner account. As the first user, register() marks it admin and
  // treats its email as verified, so the owner can never be locked out.
  const user = await authService.register(admin);
  const { token } = await authService.login(user.username, admin.password);
  setCookie(c, SESSION_COOKIE, token, cookieOpts);

  await setup.completeSetup({ appName, appDomain, email });

  return c.json({ user: privateUser(user) }, 201);
});

// Send a test email during the wizard so the operator can confirm SMTP works
// before finishing. Open only while the instance is unconfigured (same guard as
// the wizard itself); it sends with the details in the request even though they
// aren't saved yet, falling back to any stored/env values for omitted fields.
const testEmailSchema = z.object({
  to: z.string().email("A valid recipient address is required."),
  email: emailInputSchema,
});

setupRoutes.post("/test-email", async (c) => {
  if (await setup.isSetupComplete()) {
    throw conflict("This instance has already been set up.");
  }
  const parsed = testEmailSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  const candidate = await emailSettings.resolveCandidate(parsed.data.email ?? {});
  try {
    await sendTestEmail(parsed.data.to, candidate);
  } catch (err) {
    throw badRequest(
      `Could not send the test email: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return c.json({ ok: true });
});
