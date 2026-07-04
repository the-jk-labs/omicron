// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import * as settings from "@/services/settings.ts";
import * as moderation from "@/services/moderation.ts";
import * as emailSettings from "@/services/emailSettings.ts";
import * as setup from "@/services/instanceSetup.ts";
import { sendTestEmail } from "@/services/email.ts";
import { dnsRecords } from "@/services/dkim.ts";
import { checkOutboundPort25, verifyRecords } from "@/services/emailDns.ts";
import { requireAdmin } from "@/routes/middleware.ts";
import { adminUserView } from "@/routes/serializers.ts";
import { badRequest } from "@/lib/http.ts";
import { rotateSessionSecret, sessionSecretManaged } from "@/config.ts";
import { federationRunning } from "@/services/federationState.ts";
import type { AppEnv } from "@/routes/types.ts";

export const adminRoutes = new Hono<AppEnv>();

// Instance settings a moderator can read/change at runtime (moderator-only).
adminRoutes.get("/settings", async (c) => {
  requireAdmin(c);
  return c.json({ onInstanceViews: await settings.onInstanceViewsEnabled() });
});

const analyticsSchema = z.object({ onInstanceViews: z.boolean() });

// Toggle the on-instance view-counting opt-out (see ANALYTICS.md). When turned
// off, no view counters are incremented and the writer dashboard hides the
// views panel; fediverse engagement is unaffected.
adminRoutes.put("/settings/analytics", async (c) => {
  requireAdmin(c);
  const parsed = analyticsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Expected { onInstanceViews: boolean }.");
  await settings.setOnInstanceViewsEnabled(parsed.data.onInstanceViews);
  return c.json({ onInstanceViews: parsed.data.onInstanceViews });
});

// ── Instance identity (runtime config) ──────────────────────────────────────

// A full snapshot of the runtime instance identity. `federationEnabled` is the
// *desired* value (applies on restart); `federationRunning` is what this process
// actually has mounted; `sessionSecretManaged` says whether the secret can be
// rotated from the UI. The UI surfaces the running-vs-desired gap.
async function instanceSnapshot() {
  return {
    appName: await setup.getAppName(),
    appDomain: await setup.getAppDomain(),
    federationEnabled: await setup.getFederationEnabled(),
    federationRunning: federationRunning(),
    sessionSecretManaged: sessionSecretManaged(),
  };
}

adminRoutes.get("/instance", async (c) => {
  requireAdmin(c);
  return c.json(await instanceSnapshot());
});

const instanceSchema = z.object({
  appName: z.string().trim().min(1, "An instance name is required.").max(100).optional(),
  appDomain: z.string().trim().max(253).optional(),
  federationEnabled: z.boolean().optional(),
});

// Update the app name / public domain / federation toggle. A domain change
// reaches ActivityPub only after a restart (federation identity binds at boot),
// as does flipping federation on/off (the Fedify mount and queue handlers bind at
// boot); app-level name/URLs update at once. The UI surfaces those caveats.
adminRoutes.put("/instance", async (c) => {
  requireAdmin(c);
  const parsed = instanceSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid instance settings.");
  }
  await setup.setInstanceIdentity(parsed.data);
  if (parsed.data.federationEnabled !== undefined) {
    await setup.setFederationEnabled(parsed.data.federationEnabled);
  }
  return c.json(await instanceSnapshot());
});

// Rotate the auto-managed session secret. Restart-applied and signs everyone out
// then, so it's a deliberate, separate action (not part of the settings save).
// Refused when the secret is operator-supplied via env / secret file.
adminRoutes.post("/instance/rotate-secret", (c) => {
  requireAdmin(c);
  try {
    rotateSessionSecret();
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Could not rotate the session secret.");
  }
  return c.json({ ok: true });
});

// ── Email (runtime-configurable delivery) ────────────────────────────────────

// Current email configuration, with the SMTP password redacted to `hasPassword`
// so the admin form can show what's set without ever leaking the secret.
adminRoutes.get("/email", async (c) => {
  requireAdmin(c);
  return c.json(await emailSettings.redactedConfig());
});

const emailUpdateSchema = z.object({
  mode: z.enum(["console", "smtp", "relay", "direct"]).optional(),
  from: z.string().trim().max(200).optional(),
  smtp: z.object({
    host: z.string().trim().max(255).optional(),
    port: z.coerce.number().int().positive().max(65535).optional(),
    username: z.string().trim().max(255).optional(),
    // Blank/omitted = leave the stored password unchanged.
    password: z.string().max(1024).optional(),
    tls: z.boolean().optional(),
  }).optional(),
  relay: z.object({
    provider: z.enum(["resend"]).optional(),
    // Blank/omitted = leave the stored API key unchanged.
    apiKey: z.string().max(1024).optional(),
  }).optional(),
});

// Update email settings. Partial: only the keys present are written, so toggling
// the mode or fixing one field never wipes the rest.
adminRoutes.put("/email", async (c) => {
  requireAdmin(c);
  const parsed = emailUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "Invalid email settings.");
  }
  await emailSettings.setEmailConfig(parsed.data);
  return c.json(await emailSettings.redactedConfig());
});

// Generate (or rotate, if the domain changed) the DKIM keypair for a sending
// domain and return the three DNS records the operator must publish. The private
// key stays on the server; only the public key appears in the records.
const dkimSchema = z.object({
  domain: z.string().trim().min(3).max(253),
});

adminRoutes.post("/email/dkim", async (c) => {
  requireAdmin(c);
  const parsed = dkimSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "A sending domain is required.");
  }
  const domain = parsed.data.domain.toLowerCase();
  const { selector, publicKey } = await emailSettings.ensureDkimKeys(domain);
  return c.json({ domain, selector, records: dnsRecords(domain, selector, publicKey) });
});

// Live-verify that the SPF/DKIM/DMARC records are actually published, so email
// is only declared healthy once DNS is correct. Uses the stored DKIM identity.
adminRoutes.get("/email/dns", async (c) => {
  requireAdmin(c);
  const cfg = await emailSettings.getEmailConfig();
  if (!cfg.dkim.domain || !cfg.dkim.publicKey) {
    throw badRequest("No DKIM key yet — generate one for your sending domain first.");
  }
  const report = await verifyRecords(cfg.dkim.domain, cfg.dkim.selector, cfg.dkim.publicKey);
  return c.json({
    records: dnsRecords(cfg.dkim.domain, cfg.dkim.selector, cfg.dkim.publicKey),
    report,
  });
});

// Preflight whether this host can send self-hosted (direct) mail at all.
adminRoutes.get("/email/port25", async (c) => {
  requireAdmin(c);
  return c.json(await checkOutboundPort25());
});

const emailTestSchema = z.object({
  to: z.string().email("A valid recipient address is required."),
});

// Send a test message through the currently-saved configuration so the admin
// can confirm delivery (and surface the transport error verbatim if it fails).
adminRoutes.post("/email/test", async (c) => {
  requireAdmin(c);
  const parsed = emailTestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? "A valid recipient is required.");
  }
  try {
    await sendTestEmail(parsed.data.to);
  } catch (err) {
    throw badRequest(
      `Could not send the test email: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return c.json({ ok: true });
});

// ── Users ──────────────────────────────────────────────────────────────────

// The admin user table, with an optional handle / name filter (?q=).
adminRoutes.get("/users", async (c) => {
  requireAdmin(c);
  const rows = await moderation.listUsers(c.req.query("q") ?? "");
  return c.json({ users: rows.map(adminUserView) });
});

const suspendSchema = z.object({ suspend: z.boolean() });

// Suspend or reinstate a local account.
adminRoutes.post("/users/:id/suspend", async (c) => {
  const admin = requireAdmin(c);
  const parsed = suspendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Expected { suspend: boolean }.");
  await moderation.setSuspended(admin.id, c.req.param("id"), parsed.data.suspend);
  return c.json({ ok: true });
});

// ── Posts ────────────────────────────────────────────────────────────────

// Remove any local post (moderator override of the author-only delete).
adminRoutes.delete("/posts/:id", async (c) => {
  requireAdmin(c);
  await moderation.removePost(c.req.param("id"));
  return c.json({ ok: true });
});

// ── Reports (moderation queue) ─────────────────────────────────────────────

// The queue. `?status=open|resolved` filters; omit for everything.
adminRoutes.get("/reports", async (c) => {
  requireAdmin(c);
  const status = c.req.query("status");
  const filter = status === "open" || status === "resolved" ? status : undefined;
  const [reports, openCount] = await Promise.all([
    moderation.listReports(filter),
    moderation.openReportCount(),
  ]);
  return c.json({ reports, openCount });
});

const resolveSchema = z.object({ resolution: z.string().optional() });

// Mark a report resolved with an optional note.
adminRoutes.post("/reports/:id/resolve", async (c) => {
  const admin = requireAdmin(c);
  const parsed = resolveSchema.safeParse(await c.req.json().catch(() => ({})));
  const resolution = parsed.success ? parsed.data.resolution ?? "" : "";
  await moderation.resolveReport(admin.id, c.req.param("id"), resolution);
  return c.json({ ok: true });
});

// ── Defederation (domain blocklist) ────────────────────────────────────────

// The blocklist, alphabetical.
adminRoutes.get("/domains", async (c) => {
  requireAdmin(c);
  return c.json({ domains: await moderation.listBlockedDomains() });
});

const blockDomainSchema = z.object({ domain: z.string().min(1), reason: z.string().optional() });

// Defederate a domain. Returns the normalized domain and how many cached actors
// were purged as a result.
adminRoutes.post("/domains", async (c) => {
  requireAdmin(c);
  const parsed = blockDomainSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Expected { domain, reason? }.");
  const result = await moderation.blockDomain(parsed.data.domain, parsed.data.reason ?? "");
  return c.json(result, 201);
});

// Re-federate a domain. The param is the normalized domain (its primary key).
adminRoutes.delete("/domains/:domain", async (c) => {
  requireAdmin(c);
  await moderation.unblockDomain(c.req.param("domain"));
  return c.json({ ok: true });
});
