// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";

// Typed accessors over the instance_settings key/value store. Each setting has a
// default applied here, so a fresh instance behaves sensibly with no rows.

export const SETTING_KEYS = {
  analyticsOnInstanceViews: "analytics.onInstanceViews",
} as const;

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
