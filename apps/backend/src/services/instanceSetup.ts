// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as usersRepo from "@/db/repositories/users.ts";
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

// Effective email transport mode: wizard → EMAIL_TRANSPORT env/default.
// The wizard stores the operator's choice here; the concrete transport wiring
// (SMTP creds / relay) is configured in a later step (see pre-release.md S3).
export async function getEmailMode(): Promise<string> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.emailMode);
  return fromDb?.trim() || config.EMAIL_TRANSPORT;
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
  return { name, domain, federationEnabled: config.FEDERATION_ENABLED, setupComplete };
}

// Persists the wizard's instance settings and marks setup finished. The admin
// account is created by the caller (mirrors normal registration); this only
// records the chosen identity/email settings. Domain/email are optional — when
// omitted the env/default value keeps applying.
export async function completeSetup(input: {
  appName: string;
  appDomain?: string;
  emailMode?: string;
}): Promise<void> {
  const name = input.appName.trim();
  if (name) await settingsRepo.set(SETUP_KEYS.appName, name);
  const domain = input.appDomain?.trim();
  if (domain) await settingsRepo.set(SETUP_KEYS.appDomain, domain);
  const emailMode = input.emailMode?.trim();
  if (emailMode) await settingsRepo.set(SETUP_KEYS.emailMode, emailMode);
  await settingsRepo.set(SETUP_KEYS.completed, true);
}
