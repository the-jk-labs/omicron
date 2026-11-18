// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";

// Typed accessors over the instance_settings key/value store. Each setting has a
// default applied here, so a fresh instance behaves sensibly with no rows.

export const SETTING_KEYS = {
  analyticsOnInstanceViews: "analytics.onInstanceViews",
  inviteOnly: "signups.inviteOnly",
  federationNetwork: "federation.network",
  federationDiscovery: "federation.discovery",
  staffTwoFactor: "security.staffTwoFactorRequired",
} as const;

// Whether moderators and admins must use two-factor sign-in to moderate. On by default: their
// sessions can act on every account, so a stolen password alone must not be enough.
export async function staffTwoFactorRequired(): Promise<boolean> {
  return (await settingsRepo.get<boolean>(SETTING_KEYS.staffTwoFactor)) !== false;
}

export function setStaffTwoFactorRequired(required: boolean): Promise<void> {
  return settingsRepo.set(SETTING_KEYS.staffTwoFactor, required);
}

// Whether this account has to turn two-factor on before it may moderate.
export async function twoFactorRequiredFor(user: { isAdmin: boolean; isModerator: boolean }): Promise<boolean> {
  return (user.isAdmin || user.isModerator) && (await staffTwoFactorRequired());
}

// Whether joining this instance takes an invite. Off by default: sign-up is open.
export async function inviteOnlyEnabled(): Promise<boolean> {
  return (await settingsRepo.get<boolean>(SETTING_KEYS.inviteOnly)) === true;
}

export function setInviteOnly(enabled: boolean): Promise<void> {
  return settingsRepo.set(SETTING_KEYS.inviteOnly, enabled);
}

// Whether this instance counts on-instance page views at all. Opt-OUT: on by
// default, switched off by a moderator. When false, no view counters are ever
// incremented and the dashboard omits the on-instance views panel. Federated
// engagement (likes/boosts/replies/follows) is unaffected. See ANALYTICS.md.
export async function onInstanceViewsEnabled(): Promise<boolean> {
  const value = await settingsRepo.get<boolean>(SETTING_KEYS.analyticsOnInstanceViews);
  return value ?? true;
}

export function setOnInstanceViewsEnabled(enabled: boolean): Promise<void> {
  return settingsRepo.set(SETTING_KEYS.analyticsOnInstanceViews, enabled);
}

// How this instance grows its federated cache on its own (services/federationSync.ts).
// Both switches default on, so a new instance's Global feed carries the rest of
// the Omicron network from its first day.
export type FederationNetworkSettings = {
  /** Sync tracked instances in the background. */
  autoCache: boolean;
  /** Track every Omicron instance FediDB lists. */
  fedidbDiscovery: boolean;
  /** Hours between two syncs of one instance. */
  syncIntervalHours: number;
  /** Most recent authors whose outboxes one sync refreshes. */
  authorsPerInstance: number;
};

export const FEDERATION_LIMITS = {
  syncIntervalHours: { min: 1, max: 168 },
  authorsPerInstance: { min: 1, max: 100 },
} as const;

const FEDERATION_DEFAULTS: FederationNetworkSettings = {
  autoCache: true,
  fedidbDiscovery: true,
  syncIntervalHours: 6,
  authorsPerInstance: 20,
};

const clampInt = (value: unknown, { min, max }: { min: number; max: number }, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export async function getFederationNetwork(): Promise<FederationNetworkSettings> {
  const stored = (await settingsRepo.get<Partial<FederationNetworkSettings>>(SETTING_KEYS.federationNetwork)) ?? {};
  return {
    autoCache: typeof stored.autoCache === "boolean" ? stored.autoCache : FEDERATION_DEFAULTS.autoCache,
    fedidbDiscovery:
      typeof stored.fedidbDiscovery === "boolean" ? stored.fedidbDiscovery : FEDERATION_DEFAULTS.fedidbDiscovery,
    syncIntervalHours: clampInt(
      stored.syncIntervalHours,
      FEDERATION_LIMITS.syncIntervalHours,
      FEDERATION_DEFAULTS.syncIntervalHours,
    ),
    authorsPerInstance: clampInt(
      stored.authorsPerInstance,
      FEDERATION_LIMITS.authorsPerInstance,
      FEDERATION_DEFAULTS.authorsPerInstance,
    ),
  };
}

export async function setFederationNetwork(
  patch: Partial<FederationNetworkSettings>,
): Promise<FederationNetworkSettings> {
  const next = { ...(await getFederationNetwork()), ...patch };
  await settingsRepo.set(SETTING_KEYS.federationNetwork, next);
  return getFederationNetwork();
}

/** The last FediDB discovery run. */
export type FederationDiscoveryRun = { at: string; ok: boolean; found: number; added: number; error: string | null };

export async function getFederationDiscovery(): Promise<FederationDiscoveryRun | null> {
  return (await settingsRepo.get<FederationDiscoveryRun>(SETTING_KEYS.federationDiscovery)) ?? null;
}

export function setFederationDiscovery(run: FederationDiscoveryRun): Promise<void> {
  return settingsRepo.set(SETTING_KEYS.federationDiscovery, run);
}
