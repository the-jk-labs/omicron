// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";

// AI-scraper shield (Anubis) — an opt-in, admin-toggled proof-of-work wall in
// front of browser page loads. Off by default (see setup-must-be-toy-easy: a
// fresh instance gets no extra friction until an operator turns this on).
//
// How the *live* toggle works without restarting anything: Anubis runs as a
// sidecar that always listens, but it only sits in the request path when Caddy
// routes the frontend branch through it. We flip that route at runtime by
// re-loading Caddy's config through its admin API (an internal-only endpoint on
// the compose network, never published to the host). Federation and the API are
// never touched — the Caddyfile sends ActivityPub straight to the backend — so a
// challenge can't break an inbox delivery or an API client.
//
// The on-disk Caddyfile the operator ships is the single source of truth. To
// enable, we read it, swap only the frontend upstream, and POST the whole thing
// to Caddy's /load endpoint (full fidelity — on-demand TLS, the admin listener
// and every other route are preserved). To disable, we POST the file unchanged.

const SETTING_KEY = "security.anubisProtection";

// Caddy's admin API, reachable only over the compose network. Unset in a bare
// `deno task` dev run with no Caddy in front — then the feature is unavailable
// and the UI says so instead of erroring.
const CADDY_ADMIN_URL = Deno.env.get("CADDY_ADMIN_URL")?.trim();
// The Caddyfile the running Caddy loaded, mounted read-only into this container
// so we transform the operator's real config rather than a drifting duplicate.
const CADDYFILE_PATH = Deno.env.get("CADDYFILE_PATH")?.trim() || "/etc/caddy/Caddyfile";

// The single line the toggle rewrites. By default the fallback proxies the app
// directly; enabling protection re-points it at the Anubis sidecar, which then
// forwards to the same app. Keep these two strings in sync with the Caddyfile.
const DIRECT_UPSTREAM = "reverse_proxy frontend:3000";
const ANUBIS_UPSTREAM = "reverse_proxy anubis:8080";

// Whether the live toggle can work in this deployment (Caddy admin reachable).
export function anubisManaged(): boolean {
  return CADDY_ADMIN_URL !== undefined && CADDY_ADMIN_URL !== "";
}

export async function anubisProtectionEnabled(): Promise<boolean> {
  return (await settingsRepo.get<boolean>(SETTING_KEY)) ?? false;
}

// The desired Caddyfile: unchanged when disabling, frontend upstream swapped for
// the Anubis sidecar when enabling.
async function renderCaddyfile(enabled: boolean): Promise<string> {
  const base = await Deno.readTextFile(CADDYFILE_PATH);
  if (!enabled) return base;
  if (!base.includes(DIRECT_UPSTREAM)) {
    throw new Error(
      `Caddyfile at ${CADDYFILE_PATH} has no "${DIRECT_UPSTREAM}" line to route through Anubis.`,
    );
  }
  return base.replace(DIRECT_UPSTREAM, ANUBIS_UPSTREAM);
}

// Push a Caddyfile to Caddy's admin API, which adapts and applies it atomically
// with zero-downtime; a bad config is rejected and the running one is kept.
async function loadIntoCaddy(caddyfile: string): Promise<void> {
  if (!anubisManaged()) {
    throw new Error("No reverse proxy is under management in this environment.");
  }
  const res = await fetch(`${CADDY_ADMIN_URL}/load`, {
    method: "POST",
    headers: { "content-type": "text/caddyfile" },
    body: caddyfile,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(
      `Caddy rejected the config${detail ? `: ${detail}` : ` (HTTP ${res.status})`}.`,
    );
  }
}

// Apply a state to the running proxy without persisting it (used by reconcile).
async function applyToProxy(enabled: boolean): Promise<void> {
  await loadIntoCaddy(await renderCaddyfile(enabled));
}

// Turn protection on/off: apply to the proxy first, then persist only if that
// succeeded, so a failed apply leaves both the proxy and the stored state as
// they were and the UI surfaces the error.
export async function setAnubisProtectionEnabled(enabled: boolean): Promise<void> {
  await applyToProxy(enabled);
  await settingsRepo.set(SETTING_KEY, enabled);
}

// Re-assert the persisted state onto Caddy once it's reachable. Caddy boots from
// the on-disk Caddyfile (protection off) and starts *after* the backend, so on a
// full-stack restart with protection enabled there's a brief window before the
// wall goes back up. We retry in the background until Caddy answers, then push
// the desired state (both directions, so the two always converge). Fail-open by
// design: serving traffic is never blocked on this.
export function reconcileAnubisInBackground(): void {
  if (!anubisManaged()) return;
  (async () => {
    const enabled = await anubisProtectionEnabled();
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await applyToProxy(enabled);
        if (enabled) console.log("✔ Anubis scraper protection re-applied to Caddy.");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    console.warn("⚠️  Could not sync Anubis protection to Caddy after startup retries.");
  })();
}
