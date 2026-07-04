// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { type EmailInput, setEmailConfig } from "@/services/emailSettings.ts";
import { federationRunning } from "@/services/federationState.ts";
import { config } from "@/config.ts";

// First-run setup state + the wizard-managed instance settings, layered over the
// instance_settings key/value store. Precedence for every effective value is
// DB (set by the wizard) → environment → built-in default, so an operator can
// configure the instance entirely from the web wizard without editing any file,
// while an existing env-configured instance keeps working unchanged.

export const SETUP_KEYS = {
  completed: "setup.completed",
  appName: "instance.appName",
  appDomain: "instance.appDomain",
  federationEnabled: "instance.federationEnabled",
  emailMode: "email.mode",
} as const;

// Setup is complete once the wizard has finished — or, as a fallback, once any
// account already exists. The user-count fallback means instances created
// before the wizard existed (or configured purely via env) are treated as
// already set up and never see the wizard.
export async function isSetupComplete(): Promise<boolean> {
  if ((await settingsRepo.get<boolean>(SETUP_KEYS.completed)) === true) return true;
  return (await usersRepo.countUsers()) > 0;
}

// Effective public-facing instance name: wizard → PUBLIC_APP_NAME env → default.
export async function getAppName(): Promise<string> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.appName);
  return fromDb?.trim() || Deno.env.get("PUBLIC_APP_NAME")?.trim() || "Omicron";
}

// Effective public domain: wizard → APP_DOMAIN env/default (config.APP_DOMAIN).
// Note: federation actor identity is bound to config.APP_DOMAIN at boot, so a
// domain change here applies to app-level URLs immediately but only reaches
// ActivityPub after a restart (which enabling federation requires anyway).
export async function getAppDomain(): Promise<string> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.appDomain);
  return fromDb?.trim() || config.APP_DOMAIN;
}

// Effective (desired) federation state: admin toggle → FEDERATION_ENABLED
// env/default. This is the value that applies on the next restart; what the
// process is running *right now* is `federationRunning()`, since the Fedify mount
// and queue handlers bind at boot (see federationState.ts).
export async function getFederationEnabled(): Promise<boolean> {
  const fromDb = await settingsRepo.get<boolean>(SETUP_KEYS.federationEnabled);
  return typeof fromDb === "boolean" ? fromDb : config.FEDERATION_ENABLED;
}

// Persist the desired federation state from the admin page. Restart-applied.
export async function setFederationEnabled(value: boolean): Promise<void> {
  await settingsRepo.set(SETUP_KEYS.federationEnabled, value);
}

// Effective email transport mode: wizard → EMAIL_TRANSPORT env/default.
// The wizard stores the operator's choice here; the concrete transport wiring
// (SMTP creds / relay) is configured in a later step (see pre-release.md S3).
export async function getEmailMode(): Promise<string> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.emailMode);
  return fromDb?.trim() || config.EMAIL_TRANSPORT;
}

// The effective instance origin (scheme + domain), honouring a wizard-set
// domain rather than the boot-time env value. `http` only for a bare localhost
// dev domain; `https` otherwise (the bundled Caddy terminates TLS). Used for the
// links embedded in outbound email so they point at the real public domain.
export async function getOrigin(): Promise<string> {
  const domain = await getAppDomain();
  const scheme = domain.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${domain}`;
}

// Reduce any domain/URL/host:port form to a bare, lowercased hostname so the
// TLS ask endpoint compares apples to apples (the SNI Caddy sends is a bare
// host, but the stored/env domain may carry a scheme, path, or port).
function bareHost(value: string): string {
  return value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
}

// Gate for Caddy's on-demand TLS: should we obtain a certificate for `domain`?
// Answering yes triggers a real Let's Encrypt issuance, so this must be tight —
// only ever the instance's own domain (plus its `www.` alias), never localhost.
// Before setup completes there is a deliberate bootstrap window: any real
// hostname is allowed so the operator can reach the wizard over HTTPS on the
// domain they just pointed at us, before that domain is saved. Caddy rate-limits
// on-demand issuance, so the window is bounded; once setup is done only the
// saved domain gets a certificate.
export async function isTlsDomainAllowed(domain: string): Promise<boolean> {
  const host = bareHost(domain);
  if (!host) return false;
  // Public CAs can't validate these; never spend an issuance on them.
  if (host === "localhost" || host.endsWith(".localhost")) return false;

  const configured = bareHost(await getAppDomain());
  if (configured && configured !== "localhost") {
    if (host === configured || host === `www.${configured}`) return true;
  }
  // Bootstrap: pre-setup, allow the first real domain so HTTPS works on it
  // immediately (the wizard is served over that same cert).
  return !(await isSetupComplete());
}

// Update the instance identity from the admin page (runtime config). Mirrors the
// wizard, but usable after setup. An empty domain is stored as-is and falls back
// to the env/default in getAppDomain, so clearing it reverts to the boot value.
export async function setInstanceIdentity(input: {
  appName?: string;
  appDomain?: string;
}): Promise<void> {
  const name = input.appName?.trim();
  if (name) await settingsRepo.set(SETUP_KEYS.appName, name);
  if (input.appDomain !== undefined) {
    await settingsRepo.set(SETUP_KEYS.appDomain, input.appDomain.trim());
  }
}

// A public snapshot of the instance's identity, safe to expose unauthenticated.
export async function publicInfo(): Promise<{
  name: string;
  domain: string;
  federationEnabled: boolean;
  setupComplete: boolean;
}> {
  const [name, domain, setupComplete] = await Promise.all([
    getAppName(),
    getAppDomain(),
    isSetupComplete(),
  ]);
  return { name, domain, federationEnabled: federationRunning(), setupComplete };
}

// Persists the wizard's instance settings and marks setup finished. The admin
// account is created by the caller (mirrors normal registration); this only
// records the chosen identity/email settings. Domain/email are optional — when
// omitted the env/default value keeps applying.
export async function completeSetup(input: {
  appName: string;
  appDomain?: string;
  email?: EmailInput;
}): Promise<void> {
  const name = input.appName.trim();
  if (name) await settingsRepo.set(SETUP_KEYS.appName, name);
  const domain = input.appDomain?.trim();
  if (domain) await settingsRepo.set(SETUP_KEYS.appDomain, domain);
  if (input.email) await setEmailConfig(input.email);
  await settingsRepo.set(SETUP_KEYS.completed, true);
}
