// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";

// The federation flag actually in force for this process. Federation is wired at
// boot in buildApp (the Fedify fetch handler, queue job handlers, and the remote
// routes), so the live value cannot change without a restart — this holder is
// the single source of truth the running code reads, seeded once at startup from
// the effective setting (DB → env → default). Changing the toggle from the admin
// page persists to the DB and takes effect on the next restart; see
// instanceSetup.getFederationEnabled / setFederationEnabled.
let running = config.FEDERATION_ENABLED;

// What federation state this process is actually running with.
export function federationRunning(): boolean {
  return running;
}

// Seed the running flag with the effective value during boot, before the app is
// built. Not for request-time use — the mount decision has already been made.
export function seedFederationRunning(value: boolean): void {
  running = value;
}
