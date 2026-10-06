import process from "node:process";
import { config } from "@/config.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as passkeysRepo from "@/db/repositories/passkeys.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { renderMarkdown } from "@/lib/markdown.ts";
import { type EmailInput, getEmailMode, setEmailConfig } from "@/services/emailSettings.ts";
import { federationRunning } from "@/services/federationState.ts";

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
  bannerText: "instance.bannerText",
  bannerImageUrl: "instance.bannerImageUrl",
  about: "instance.about",
  aboutHtml: "instance.aboutHtml",
  rules: "instance.rules",
  rulesHtml: "instance.rulesHtml",
  privacyPolicy: "instance.privacyPolicy",
  privacyPolicyHtml: "instance.privacyPolicyHtml",
  contactEmail: "instance.contactEmail",
  contactUrl: "instance.contactUrl",
  abuseEmail: "instance.abuseEmail",
  statusUrl: "instance.statusUrl",
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
  return fromDb?.trim() || process.env.PUBLIC_APP_NAME?.trim() || "Omicron";
}

// Effective public domain: wizard → APP_DOMAIN env/default (config.APP_DOMAIN).
// Note: the federation origin is seeded once at boot from this same effective
// domain (see main.ts / federationState.ts), so a domain change here applies to
// app-level URLs immediately but only reaches ActivityPub after a restart
// (which enabling federation requires anyway).
export async function getAppDomain(): Promise<string> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.appDomain);
  // A domain typed as a URL ("https://blog.example.com/") is reduced to host[:port].
  return (
    fromDb
      ?.trim()
      .replace(/^https?:\/\//i, "")
      .split("/")[0] || config.APP_DOMAIN
  );
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
  return value
    .trim()
    .toLowerCase()
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
// `bannerText` follows the same clear-to-revert rule: an explicit empty string
// is stored (falls back to the built-in sentence in the UI), `undefined` leaves
// the current value untouched.
export async function setInstanceIdentity(input: {
  appName?: string;
  appDomain?: string;
  bannerText?: string;
  about?: string;
  rules?: string;
  privacyPolicy?: string;
  contactEmail?: string;
  contactUrl?: string;
  abuseEmail?: string;
  statusUrl?: string;
}): Promise<void> {
  const name = input.appName?.trim();
  if (name) await settingsRepo.set(SETUP_KEYS.appName, name);
  if (input.appDomain !== undefined) {
    const before = bareHost(await getAppDomain());
    await settingsRepo.set(SETUP_KEYS.appDomain, input.appDomain.trim());
    // A passkey is bound to the hostname it was made on and can never sign in on another.
    if (bareHost(await getAppDomain()) !== before) await passkeysRepo.deleteAll();
  }
  if (input.bannerText !== undefined) {
    await settingsRepo.set(SETUP_KEYS.bannerText, input.bannerText.trim());
  }
  await Promise.all([
    setMarkdownSetting(SETUP_KEYS.about, SETUP_KEYS.aboutHtml, input.about),
    setMarkdownSetting(SETUP_KEYS.rules, SETUP_KEYS.rulesHtml, input.rules),
    setMarkdownSetting(SETUP_KEYS.privacyPolicy, SETUP_KEYS.privacyPolicyHtml, input.privacyPolicy),
    setStringSetting(SETUP_KEYS.contactEmail, input.contactEmail),
    setStringSetting(SETUP_KEYS.contactUrl, input.contactUrl),
    setStringSetting(SETUP_KEYS.abuseEmail, input.abuseEmail),
    setStringSetting(SETUP_KEYS.statusUrl, input.statusUrl),
  ]);
}

async function setMarkdownSetting(sourceKey: string, htmlKey: string, value: string | undefined): Promise<void> {
  if (value === undefined) return;
  const source = value.trim();
  await Promise.all([settingsRepo.set(sourceKey, source), settingsRepo.set(htmlKey, renderMarkdown(source))]);
}

async function setStringSetting(key: string, value: string | undefined): Promise<void> {
  if (value !== undefined) await settingsRepo.set(key, value.trim());
}

export async function getInstancePublicSettings(): Promise<{
  about: string;
  rules: string;
  privacyPolicy: string;
  contactEmail: string;
  contactUrl: string;
  abuseEmail: string;
  statusUrl: string;
}> {
  const [about, rules, privacyPolicy, contactEmail, contactUrl, abuseEmail, statusUrl] = await Promise.all([
    settingsRepo.get<string>(SETUP_KEYS.about),
    settingsRepo.get<string>(SETUP_KEYS.rules),
    settingsRepo.get<string>(SETUP_KEYS.privacyPolicy),
    settingsRepo.get<string>(SETUP_KEYS.contactEmail),
    settingsRepo.get<string>(SETUP_KEYS.contactUrl),
    settingsRepo.get<string>(SETUP_KEYS.abuseEmail),
    settingsRepo.get<string>(SETUP_KEYS.statusUrl),
  ]);
  return {
    about: about?.trim() ?? "",
    rules: rules?.trim() ?? "",
    privacyPolicy: privacyPolicy?.trim() ?? "",
    contactEmail: contactEmail?.trim() ?? "",
    contactUrl: contactUrl?.trim() ?? "",
    abuseEmail: abuseEmail?.trim() ?? "",
    statusUrl: statusUrl?.trim() ?? "",
  };
}

// The admin-set tagline for the signed-out visitor card, or null when unset —
// callers fall back to the built-in "An independent <name> instance in the
// fediverse." sentence in that case, so an unconfigured instance still reads
// naturally.
export async function getBannerText(): Promise<string | null> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.bannerText);
  return fromDb?.trim() || null;
}

// The admin-uploaded banner image URL for the signed-out visitor card, or null
// when unset — callers fall back to the bundled default artwork.
export async function getBannerImageUrl(): Promise<string | null> {
  const fromDb = await settingsRepo.get<string>(SETUP_KEYS.bannerImageUrl);
  return fromDb?.trim() || null;
}

// Persist (or, with `null`, clear) the banner image URL. Clearing only drops
// the setting — the uploaded file itself stays on disk until the upload GC
// reaps it after the grace period (see services/uploadGc.ts), since federated
// copies may still reference the URL.
export async function setBannerImageUrl(url: string | null): Promise<void> {
  await settingsRepo.set(SETUP_KEYS.bannerImageUrl, url ?? "");
}

// A public snapshot of the instance's identity, safe to expose unauthenticated.
//
// `emailEnabled` is here rather than behind the admin API because the pages
// that need it are the ones nobody is signed in on: password reset and email
// verification both end at "check your inbox", and on an instance still using
// the default `console` transport there is no inbox to check — the link only
// ever reaches the operator's backend log. A visitor who is locked out has to
// be told that, and it gives away nothing: it is a property of the instance,
// not of any account, and it names no host, credential or key.
export async function publicInfo(): Promise<{
  name: string;
  domain: string;
  federationEnabled: boolean;
  setupComplete: boolean;
  emailEnabled: boolean;
  // Whether a new account must confirm its email before it can sign in
  // (EMAIL_VERIFICATION_REQUIRED). The register page reads this to decide
  // between "check your inbox" and an instant sign-in.
  emailVerificationRequired: boolean;
  bannerText: string | null;
  bannerImageUrl: string | null;
  aboutHtml: string | null;
  rulesHtml: string | null;
  privacyPolicyHtml: string | null;
  contactEmail: string | null;
  contactUrl: string | null;
  abuseEmail: string | null;
  statusUrl: string | null;
}> {
  const [
    name,
    domain,
    setupComplete,
    emailMode,
    bannerText,
    bannerImageUrl,
    aboutHtml,
    rulesHtml,
    privacyPolicyHtml,
    contactEmail,
    contactUrl,
    abuseEmail,
    statusUrl,
  ] = await Promise.all([
    getAppName(),
    getAppDomain(),
    isSetupComplete(),
    getEmailMode(),
    getBannerText(),
    getBannerImageUrl(),
    settingsRepo.get<string>(SETUP_KEYS.aboutHtml),
    settingsRepo.get<string>(SETUP_KEYS.rulesHtml),
    settingsRepo.get<string>(SETUP_KEYS.privacyPolicyHtml),
    settingsRepo.get<string>(SETUP_KEYS.contactEmail),
    settingsRepo.get<string>(SETUP_KEYS.contactUrl),
    settingsRepo.get<string>(SETUP_KEYS.abuseEmail),
    settingsRepo.get<string>(SETUP_KEYS.statusUrl),
  ]);
  return {
    name,
    domain,
    federationEnabled: federationRunning(),
    setupComplete,
    emailEnabled: emailMode !== "console",
    emailVerificationRequired: config.EMAIL_VERIFICATION_REQUIRED,
    bannerText,
    bannerImageUrl,
    aboutHtml: aboutHtml?.trim() || null,
    rulesHtml: rulesHtml?.trim() || null,
    privacyPolicyHtml: privacyPolicyHtml?.trim() || null,
    contactEmail: contactEmail?.trim() || null,
    contactUrl: contactUrl?.trim() || null,
    abuseEmail: abuseEmail?.trim() || null,
    statusUrl: statusUrl?.trim() || null,
  };
}

// Persists the wizard's instance settings and marks setup finished. The admin
// account is created by the caller (mirrors normal registration); this only
// records the chosen identity/email settings. Domain/email are optional — when
// omitted the env/default value keeps applying.
export async function completeSetup(input: { appName: string; appDomain?: string; email?: EmailInput }): Promise<void> {
  const name = input.appName.trim();
  if (name) await settingsRepo.set(SETUP_KEYS.appName, name);
  const domain = input.appDomain?.trim();
  if (domain) await settingsRepo.set(SETUP_KEYS.appDomain, domain);
  if (input.email) await setEmailConfig(input.email);
  await settingsRepo.set(SETUP_KEYS.completed, true);
}
