// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFile } from "node:fs/promises";
import process from "node:process";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { routeThroughAnubis } from "@/lib/caddyfile.ts";
import { normalizeNetwork } from "@/lib/ipNetwork.ts";
import { postUnix } from "@/lib/unixHttp.ts";
import { renderAccessRules, testAccessRules, type AccessRule } from "@/services/accessRules.ts";

// AI-scraper shield (Anubis) — an opt-in, admin-toggled proof-of-work wall in
// front of browser page loads. Off by default (see setup-must-be-toy-easy: a
// fresh instance gets no extra friction until an operator turns this on).
//
// How the *live* toggle works without restarting anything: Anubis runs as a
// sidecar that always listens, but it only sits in the request path when Caddy
// routes the frontend branch through it. We flip that route at runtime by
// re-loading Caddy's config through its admin API (an internal-only endpoint on
// shared socket, never on a TCP port). Federation and the API are
// never touched — the Caddyfile sends ActivityPub straight to the backend — so a
// challenge can't break an inbox delivery or an API client.
//
// The on-disk Caddyfile the operator ships is the single source of truth. To
// enable, we read it, swap only the frontend upstream, and POST the whole thing
// to Caddy's /load endpoint (full fidelity — on-demand TLS, the admin listener
// and every other route are preserved). Custom IP rules wrap the app branch
// independently of the challenge switch; the on-disk policy stays untouched.

const SETTING_KEY = "security.anubisProtection";
const RULES_KEY = "security.accessRules";
let pending: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

export async function accessRules(): Promise<AccessRule[]> {
  return (await settingsRepo.get<AccessRule[]>(RULES_KEY)) ?? [];
}

// A custom URL remains supported for operators managing a separate Caddy.
const CADDY_ADMIN_URL = process.env.CADDY_ADMIN_URL?.trim();
const CADDY_ADMIN_SOCKET = process.env.CADDY_ADMIN_SOCKET?.trim();
// The Caddyfile the running Caddy loaded, mounted read-only into this container
// so we transform the operator's real config rather than a drifting duplicate.
const CADDYFILE_PATH = process.env.CADDYFILE_PATH?.trim() || "/etc/caddy/Caddyfile";

// Whether the live toggle can work in this deployment (Caddy admin reachable).
export function anubisManaged(): boolean {
  return !!(CADDY_ADMIN_URL || CADDY_ADMIN_SOCKET);
}

export async function anubisProtectionEnabled(): Promise<boolean> {
  return (await settingsRepo.get<boolean>(SETTING_KEY)) ?? false;
}

// The normal app policy stays the fallback for IP rules that do not match.
async function renderCaddyfile(enabled: boolean, rules?: AccessRule[]): Promise<string> {
  const base = await readFile(CADDYFILE_PATH, "utf8");
  return renderAccessRules(enabled ? routeThroughAnubis(base) : base, rules ?? (await accessRules()));
}

// Push a Caddyfile to Caddy's admin API, which adapts and applies it atomically
// with zero-downtime; a bad config is rejected and the running one is kept.
async function loadIntoCaddy(caddyfile: string): Promise<void> {
  if (!anubisManaged()) {
    throw new Error("No reverse proxy is under management in this environment.");
  }
  const res = CADDY_ADMIN_URL
    ? await fetch(`${CADDY_ADMIN_URL}/load`, {
        method: "POST",
        headers: { "content-type": "text/caddyfile" },
        body: caddyfile,
        signal: AbortSignal.timeout(10_000),
      })
    : await postUnix(CADDY_ADMIN_SOCKET!, "/load", caddyfile);
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(`Caddy rejected the config${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`);
  }
}

// Apply a state to the running proxy without persisting it (used by reconcile).
async function applyToProxy(enabled: boolean): Promise<void> {
  await loadIntoCaddy(await renderCaddyfile(enabled));
}

// Turn protection on/off: apply to the proxy first, then persist only if that
// succeeded, so a failed apply leaves both the proxy and the stored state as
// they were and the UI surfaces the error.
export function setAnubisProtectionEnabled(enabled: boolean): Promise<void> {
  return serialized(async () => {
    const previous = await anubisProtectionEnabled();
    await applyToProxy(enabled);
    try {
      await settingsRepo.set(SETTING_KEY, enabled);
    } catch (error) {
      await applyToProxy(previous);
      throw error;
    }
  });
}

export type AccessRuleInput = { network: string; action: "allow" | "block"; reason: string; expiresInHours: number };

async function saveAccessRules(next: AccessRule[], previous: AccessRule[]): Promise<AccessRule[]> {
  const enabled = await anubisProtectionEnabled();
  await loadIntoCaddy(await renderCaddyfile(enabled, next));
  try {
    await settingsRepo.set(RULES_KEY, next);
  } catch (error) {
    await loadIntoCaddy(await renderCaddyfile(enabled, previous));
    throw error;
  }
  return next;
}

export function addAccessRule(input: AccessRuleInput): Promise<AccessRule[]> {
  return serialized(async () => {
    const network = normalizeNetwork(input.network);
    if (![1, 24, 168, 720].includes(input.expiresInHours))
      throw new Error("Choose an expiry of 1 hour, 24 hours, 7 days or 30 days.");
    const previous = await accessRules();
    const now = Date.now();
    const active = previous.filter((rule) => Date.parse(rule.expiresAt) > now);
    if (active.length >= 100) throw new Error("At most 100 unexpired IP rules are supported. Remove a rule first.");
    const rule: AccessRule = {
      id: crypto.randomUUID(),
      network,
      action: input.action,
      reason: input.reason.trim(),
      enabled: true,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + input.expiresInHours * 3_600_000).toISOString(),
    };
    return saveAccessRules([rule, ...active], previous);
  });
}

export function updateAccessRule(id: string, enabled: boolean | null): Promise<AccessRule[]> {
  return serialized(async () => {
    const previous = await accessRules();
    const existing = previous.find((rule) => rule.id === id);
    if (!existing) throw new Error("IP rule not found. Refresh the list.");
    if (enabled && Date.parse(existing.expiresAt) <= Date.now())
      throw new Error("This rule has expired. Add a new rule instead.");
    const next =
      enabled === null
        ? previous.filter((rule) => rule.id !== id)
        : previous.map((rule) => (rule.id === id ? { ...rule, enabled } : rule));
    return saveAccessRules(next, previous);
  });
}

export async function previewAccessRules(
  ip: string,
  path: string,
  draft?: Pick<AccessRuleInput, "network" | "action">,
) {
  const rules = [...(await accessRules())];
  if (draft)
    rules.unshift({
      id: "draft",
      network: normalizeNetwork(draft.network),
      action: draft.action,
      reason: "",
      enabled: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
  return testAccessRules(rules, ip, path);
}

// Re-assert the persisted state onto Caddy once it's reachable. Caddy boots from
// the on-disk Caddyfile (protection off) and starts *after* the backend, so on a
// full-stack restart with protection enabled there's a brief window before the
// wall goes back up. We retry in the background until Caddy answers, then push
// the desired state (both directions, so the two always converge). Fail-open by
// design: serving traffic is never blocked on this.
export function reconcileAnubisInBackground(): void {
  if (!anubisManaged()) return;
  void (async () => {
    const enabled = await anubisProtectionEnabled();
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await serialized(async () => applyToProxy(await anubisProtectionEnabled()));
        if (enabled) console.log("✔ Anubis scraper protection re-applied to Caddy.");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    console.warn("! Could not sync Anubis protection to Caddy after startup retries.");
  })();
}
