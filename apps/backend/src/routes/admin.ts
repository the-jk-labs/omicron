// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { z } from "zod";
import * as settings from "@/services/settings.ts";
import * as moderation from "@/services/moderation.ts";
import { requireAdmin } from "@/routes/middleware.ts";
import { adminUserView } from "@/routes/serializers.ts";
import { badRequest } from "@/lib/http.ts";
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
