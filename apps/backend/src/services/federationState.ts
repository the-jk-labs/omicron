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

// The ActivityPub origin this process constructs identities against (scheme +
// domain). Like the `running` flag above, it is seeded once at boot and fixed
// for the process — Fedify contexts and actor/activity URIs are built from it
// throughout. But unlike the boot-time env domain, it honours the domain the
// setup wizard persisted to the DB (see instanceSetup.getOrigin), so a
// wizard-configured HTTPS domain is what federation actually uses even when
// APP_DOMAIN was left at the default `localhost:5173`. Falls back to the same
// config-derived value as before when nothing has been seeded (e.g. bare unit
// tests that don't run main()). Defensive about a missing APP_DOMAIN so a unit
// test that mocks config as `{}` still loads.
const configOrigin = (): string => {
  const domain = config.APP_DOMAIN?.trim() || "localhost:5173";
  return `${domain.startsWith("localhost") ? "http" : "https"}://${domain}`;
};
let origin = configOrigin();

// The effective federation origin in force for this process.
export function federationOrigin(): string {
  return origin;
}

// Seed the federation origin with the effective value during boot, before the
// app binds its ActivityPub routes. Not for request-time use — the value is
// fixed for the process's lifetime.
export function seedFederationOrigin(value: string): void {
  origin = value;
}
