// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import * as settings from "@/services/settings.ts";
import * as anubis from "@/services/anubisProtection.ts";
import * as seo from "@/services/seo.ts";
import * as unsplash from "@/services/unsplash.ts";
import * as moderation from "@/services/moderation.ts";
import * as tagsService from "@/services/tags.ts";
import * as emailSettings from "@/services/emailSettings.ts";
import * as setup from "@/services/instanceSetup.ts";
import * as mediaService from "@/services/media.ts";
import { sendTestEmail } from "@/services/email.ts";
import { dnsRecords } from "@/services/dkim.ts";
import { checkOutboundPort25, verifyRecords } from "@/services/emailDns.ts";
import { requireAdmin } from "@/routes/middleware.ts";
import { adminUserView } from "@/routes/serializers.ts";
import { badRequest } from "@/lib/http.ts";
import { rotateSessionSecret, sessionSecretManaged } from "@/config.ts";
import { federationRunning } from "@/services/federationState.ts";
import { jsonBody } from "@/lib/validate.ts";
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
adminRoutes.put(
  "/settings/analytics",
  jsonBody(analyticsSchema, "Expected { onInstanceViews: boolean }."),
  async (c) => {
    requireAdmin(c);
    const { onInstanceViews } = c.req.valid("json");
    await settings.setOnInstanceViewsEnabled(onInstanceViews);
    return c.json({ onInstanceViews });
  },
);

// ── Security (AI-scraper shield) ─────────────────────────────────────────────

// Current state of the Anubis proof-of-work wall. `anubisManaged` says whether
// the live toggle can work here (Caddy admin reachable) — false in a bare dev
// run, so the UI can explain rather than offer a switch that would error.
async function securitySnapshot() {
  return {
    anubisProtection: await anubis.anubisProtectionEnabled(),
    anubisManaged: anubis.anubisManaged(),
  };
}

adminRoutes.get("/security", async (c) => {
  requireAdmin(c);
  return c.json(await securitySnapshot());
});

const securitySchema = z.object({ anubisProtection: z.boolean() });

// Flip the scraper shield on/off. Applied live via Caddy's admin API (no
// restart); federation and the API are never routed through it. A failure to
// reach/reconfigure Caddy is surfaced verbatim and nothing is persisted.
adminRoutes.put(
  "/security/anubis",
  jsonBody(securitySchema, "Expected { anubisProtection: boolean }."),
  async (c) => {
    requireAdmin(c);
    try {
      await anubis.setAnubisProtectionEnabled(c.req.valid("json").anubisProtection);
    } catch (err) {
      throw badRequest(
        err instanceof Error ? err.message : "Could not update scraper protection.",
      );
    }
    return c.json(await securitySnapshot());
  },
);

// ── Discoverability / SEO ────────────────────────────────────────────────────

// Search-engine indexing toggle + per-engine site-verification tokens. The
// public /api/seo endpoint (and the app's robots.txt / sitemap.xml / <head>)
// read the same settings; this is the moderator-only write side.
adminRoutes.get("/seo", async (c) => {
  requireAdmin(c);
  return c.json(await seo.getSeoSettings());
});

const seoSchema = z.object({
  indexingEnabled: z.boolean().optional(),
  verification: z.record(z.string(), z.string()).optional(),
  indexNowEnabled: z.boolean().optional(),
});

adminRoutes.put("/seo", jsonBody(seoSchema, "Invalid SEO settings."), async (c) => {
  requireAdmin(c);
  await seo.setSeoSettings(c.req.valid("json"));
  return c.json(await seo.getSeoSettings());
});

// ── Media (Unsplash banner picker) ──────────────────────────────────────────

// The access key that turns the editor's Unsplash tab on. Only ever reported as
// configured-or-not: an admin who wants to check the key reads it from their
// Unsplash dashboard, and echoing a stored credential back over the API is how
// one ends up in a browser cache or a screenshot.
adminRoutes.get("/unsplash", async (c) => {
  requireAdmin(c);
  return c.json({ configured: await unsplash.configured() });
});

// A blank (or omitted) key clears it, which is how the feature is turned off.
const unsplashSchema = z.object({ accessKey: z.string().trim().max(200).nullish() });

adminRoutes.put(
  "/unsplash",
  jsonBody(unsplashSchema, "Expected { accessKey: string | null }."),
  async (c) => {
    requireAdmin(c);
    await unsplash.setAccessKey(c.req.valid("json").accessKey ?? null);
    return c.json({ configured: await unsplash.configured() });
  },
);

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
    bannerText: await setup.getBannerText(),
    bannerImageUrl: await setup.getBannerImageUrl(),
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
  // The tagline on the signed-out visitor card. An empty string clears it back
  // to the built-in default sentence.
  bannerText: z.string().trim().max(280).optional(),
});

// Update the app name / public domain / federation toggle / banner tagline. A
// domain change reaches ActivityPub only after a restart (federation identity
// binds at boot), as does flipping federation on/off (the Fedify mount and
// queue handlers bind at boot); app-level name/URLs/banner text update at
// once. The UI surfaces those caveats.
adminRoutes.put("/instance", jsonBody(instanceSchema), async (c) => {
  requireAdmin(c);
  const body = c.req.valid("json");
  await setup.setInstanceIdentity(body);
  if (body.federationEnabled !== undefined) {
    await setup.setFederationEnabled(body.federationEnabled);
  }
  return c.json(await instanceSnapshot());
});

// Upload the banner image shown on the signed-out visitor card. Reuses the same
// validated, size-capped, magic-byte-checked disk storage as post/avatar
// uploads (see services/media.ts); the browser has already downscaled and
// re-encoded the image before it reaches here (see lib/editor/image.ts), so
// this layer only validates and persists.
adminRoutes.post("/instance/banner", async (c) => {
  requireAdmin(c);
  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const url = await mediaService.saveImage(bytes, contentType);
  await setup.setBannerImageUrl(url);
  return c.json(await instanceSnapshot(), 201);
});

// Revert the banner image to the bundled default artwork.
adminRoutes.delete("/instance/banner", async (c) => {
  requireAdmin(c);
  await setup.setBannerImageUrl(null);
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
adminRoutes.put("/email", jsonBody(emailUpdateSchema), async (c) => {
  requireAdmin(c);
  await emailSettings.setEmailConfig(c.req.valid("json"));
  return c.json(await emailSettings.redactedConfig());
});

// Generate (or rotate, if the domain changed) the DKIM keypair for a sending
// domain and return the three DNS records the operator must publish. The private
// key stays on the server; only the public key appears in the records.
const dkimSchema = z.object({
  domain: z.string().trim().min(3).max(253),
});

adminRoutes.post("/email/dkim", jsonBody(dkimSchema), async (c) => {
  requireAdmin(c);
  const domain = c.req.valid("json").domain.toLowerCase();
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
adminRoutes.post("/email/test", jsonBody(emailTestSchema), async (c) => {
  requireAdmin(c);
  try {
    await sendTestEmail(c.req.valid("json").to);
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
adminRoutes.post(
  "/users/:id/suspend",
  jsonBody(suspendSchema, "Expected { suspend: boolean }."),
  async (c) => {
    const admin = requireAdmin(c);
    await moderation.setSuspended(admin.id, c.req.param("id"), c.req.valid("json").suspend);
    return c.json({ ok: true });
  },
);

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
adminRoutes.post("/reports/:id/resolve", jsonBody(resolveSchema.catch({})), async (c) => {
  const admin = requireAdmin(c);
  const resolution = c.req.valid("json").resolution ?? "";
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
adminRoutes.post(
  "/domains",
  jsonBody(blockDomainSchema, "Expected { domain, reason? }."),
  async (c) => {
    requireAdmin(c);
    const { domain, reason } = c.req.valid("json");
    const result = await moderation.blockDomain(domain, reason ?? "");
    return c.json(result, 201);
  },
);

// Re-federate a domain. The param is the normalized domain (its primary key).
adminRoutes.delete("/domains/:domain", async (c) => {
  requireAdmin(c);
  await moderation.unblockDomain(c.req.param("domain"));
  return c.json({ ok: true });
});

// ── Tags (alias + merge for fragmented / misspelled tags) ────────────────────

adminRoutes.get("/tags/aliases", async (c) => {
  requireAdmin(c);
  return c.json({ aliases: await tagsService.listAliases() });
});

const tagAliasSchema = z.object({ alias: z.string().min(1), target: z.string().min(1) });

adminRoutes.post("/tags/alias", jsonBody(tagAliasSchema), async (c) => {
  requireAdmin(c);
  const { alias, target } = c.req.valid("json");
  await tagsService.createAlias(alias, target);
  return c.json({ ok: true }, 201);
});

const tagMergeSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });

adminRoutes.post("/tags/merge", jsonBody(tagMergeSchema), async (c) => {
  requireAdmin(c);
  const { from, to } = c.req.valid("json");
  await tagsService.merge(from, to);
  return c.json({ ok: true });
});
