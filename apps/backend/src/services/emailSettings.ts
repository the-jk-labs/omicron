// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { generateKeyPair } from "@/services/dkim.ts";
import { config } from "@/config.ts";

// Web-managed email configuration, layered over the instance_settings key/value
// store exactly like the instance identity (see instanceSetup.ts). The operator
// sets everything from the setup wizard or the admin page — no SMTP_* env vars to
// hand-edit. Precedence for every effective value is DB (wizard/admin) →
// environment → built-in default, so an existing env-configured instance keeps
// working unchanged.
//
// Four sending modes:
//   - console: log to stdout (zero config, the default)
//   - smtp:    any SMTP server / provider SMTP endpoint
//   - relay:   a provider's HTTP API — paste one API key (Path A)
//   - direct:  self-hosted, sent straight to the recipient's MX and DKIM-signed
//              (Path B; requires the DNS records below and open port 25)

export type EmailMode = "console" | "smtp" | "relay" | "direct";
export type RelayProvider = "resend";

export const EMAIL_KEYS = {
  mode: "email.mode",
  from: "email.from",
  smtpHost: "email.smtp.host",
  smtpPort: "email.smtp.port",
  smtpUsername: "email.smtp.username",
  smtpPassword: "email.smtp.password",
  smtpTls: "email.smtp.tls",
  relayProvider: "email.relay.provider",
  relayApiKey: "email.relay.apiKey",
  dkimDomain: "email.dkim.domain",
  dkimSelector: "email.dkim.selector",
  dkimPrivateKey: "email.dkim.privateKey",
  dkimPublicKey: "email.dkim.publicKey",
} as const;

export const DEFAULT_DKIM_SELECTOR = "omicron";

export interface EmailConfig {
  mode: EmailMode;
  /** RFC 5322 From header, e.g. `Omicron <no-reply@example.com>`. */
  from: string;
  smtp: {
    host?: string;
    port: number;
    username?: string;
    password?: string;
    /** Implicit TLS (465). When false, STARTTLS is used (587). */
    tls: boolean;
  };
  relay: {
    provider: RelayProvider;
    apiKey?: string;
  };
  dkim: {
    domain?: string;
    selector: string;
    privateKey?: string;
    publicKey?: string;
  };
}

function isMode(v: unknown): v is EmailMode {
  return v === "console" || v === "smtp" || v === "relay" || v === "direct";
}

// Reduce a domain/URL/host:port to a bare hostname for the From address.
function bareHost(value: string): string {
  return value.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0];
}

// The default From when the operator hasn't set one: `<AppName> <noreply@domain>`
// built from the instance's effective name + domain (wizard/DB → env → default),
// so a fresh instance sends as noreply@your-domain out of the box. Reads the
// instance settings keys directly to avoid an import cycle with instanceSetup.
async function defaultFrom(): Promise<string> {
  const domainRaw = (await settingsRepo.get<string>("instance.appDomain"))?.trim() ||
    config.APP_DOMAIN;
  const domain = bareHost(domainRaw) || "localhost";
  const name = (await settingsRepo.get<string>("instance.appName"))?.trim() ||
    Deno.env.get("PUBLIC_APP_NAME")?.trim() || "Omicron";
  return `${name} <noreply@${domain}>`;
}

// The effective, ready-to-send configuration. Every field falls back through
// env then a built-in default, so this is always fully populated.
export async function getEmailConfig(): Promise<EmailConfig> {
  const g = settingsRepo.get;
  const [
    mode,
    from,
    host,
    port,
    username,
    password,
    tls,
    relayProvider,
    relayApiKey,
    dkimDomain,
    dkimSelector,
    dkimPrivateKey,
    dkimPublicKey,
  ] = await Promise.all([
    g<string>(EMAIL_KEYS.mode),
    g<string>(EMAIL_KEYS.from),
    g<string>(EMAIL_KEYS.smtpHost),
    g<number>(EMAIL_KEYS.smtpPort),
    g<string>(EMAIL_KEYS.smtpUsername),
    g<string>(EMAIL_KEYS.smtpPassword),
    g<boolean>(EMAIL_KEYS.smtpTls),
    g<string>(EMAIL_KEYS.relayProvider),
    g<string>(EMAIL_KEYS.relayApiKey),
    g<string>(EMAIL_KEYS.dkimDomain),
    g<string>(EMAIL_KEYS.dkimSelector),
    g<string>(EMAIL_KEYS.dkimPrivateKey),
    g<string>(EMAIL_KEYS.dkimPublicKey),
  ]);
  // Explicit From (wizard/admin, then env) wins; otherwise derive noreply@domain
  // from the instance identity. The built-in config default is only a last resort
  // inside defaultFrom (config.APP_DOMAIN).
  const explicitFrom = from?.trim() || Deno.env.get("EMAIL_FROM")?.trim();
  return {
    mode: isMode(mode) ? mode : (config.EMAIL_TRANSPORT as EmailMode),
    from: explicitFrom || (await defaultFrom()),
    smtp: {
      host: host?.trim() || config.SMTP_HOST,
      port: port ?? config.SMTP_PORT,
      username: username?.trim() || config.SMTP_USERNAME,
      password: password ?? config.SMTP_PASSWORD,
      tls: tls ?? config.SMTP_TLS,
    },
    relay: {
      provider: (relayProvider as RelayProvider) || "resend",
      apiKey: relayApiKey || undefined,
    },
    dkim: {
      domain: dkimDomain?.trim() || undefined,
      selector: dkimSelector?.trim() || DEFAULT_DKIM_SELECTOR,
      privateKey: dkimPrivateKey || undefined,
      publicKey: dkimPublicKey || undefined,
    },
  };
}

// Input accepted from the wizard / admin page. Everything is optional so a
// partial update (e.g. just flipping the mode, or fixing the password) only
// touches the keys it names. An empty secret (password / API key) is treated as
// "unchanged" so the admin can re-save the form without re-entering it.
export interface EmailInput {
  mode?: EmailMode;
  from?: string;
  smtp?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    tls?: boolean;
  };
  relay?: {
    provider?: RelayProvider;
    apiKey?: string;
  };
}

export async function setEmailConfig(input: EmailInput): Promise<void> {
  if (input.mode) await settingsRepo.set(EMAIL_KEYS.mode, input.mode);
  if (input.from !== undefined) await settingsRepo.set(EMAIL_KEYS.from, input.from.trim());
  const s = input.smtp;
  if (s) {
    if (s.host !== undefined) await settingsRepo.set(EMAIL_KEYS.smtpHost, s.host.trim());
    if (s.port !== undefined) await settingsRepo.set(EMAIL_KEYS.smtpPort, s.port);
    if (s.username !== undefined) {
      await settingsRepo.set(EMAIL_KEYS.smtpUsername, s.username.trim());
    }
    // Never clobber a stored secret with a blank — blank means "leave as is".
    if (s.password) await settingsRepo.set(EMAIL_KEYS.smtpPassword, s.password);
    if (s.tls !== undefined) await settingsRepo.set(EMAIL_KEYS.smtpTls, s.tls);
  }
  const r = input.relay;
  if (r) {
    if (r.provider) await settingsRepo.set(EMAIL_KEYS.relayProvider, r.provider);
    if (r.apiKey) await settingsRepo.set(EMAIL_KEYS.relayApiKey, r.apiKey);
  }
}

// Ensure a DKIM keypair exists for `domain` (generating one on first use) and
// record the domain/selector. Returns the public key for the DNS record. The
// private key never leaves the server.
export async function ensureDkimKeys(
  domain: string,
): Promise<{ selector: string; publicKey: string }> {
  const existingDomain = await settingsRepo.get<string>(EMAIL_KEYS.dkimDomain);
  let publicKey = await settingsRepo.get<string>(EMAIL_KEYS.dkimPublicKey);
  const selector = (await settingsRepo.get<string>(EMAIL_KEYS.dkimSelector))?.trim() ||
    DEFAULT_DKIM_SELECTOR;

  // (Re)generate when there is no key yet, or the sending domain changed.
  if (!publicKey || existingDomain?.trim() !== domain.trim()) {
    const pair = await generateKeyPair();
    await settingsRepo.set(EMAIL_KEYS.dkimPrivateKey, pair.privateKey);
    await settingsRepo.set(EMAIL_KEYS.dkimPublicKey, pair.publicKey);
    await settingsRepo.set(EMAIL_KEYS.dkimSelector, selector);
    await settingsRepo.set(EMAIL_KEYS.dkimDomain, domain.trim());
    publicKey = pair.publicKey;
  }
  return { selector, publicKey };
}

// Build a concrete EmailConfig from raw wizard/admin input WITHOUT persisting —
// used to send a test message with details the operator hasn't saved yet. Any
// field the input omits falls back to the current effective config.
export async function resolveCandidate(input: EmailInput): Promise<EmailConfig> {
  const base = await getEmailConfig();
  return {
    mode: input.mode ?? base.mode,
    from: input.from?.trim() || base.from,
    smtp: {
      host: input.smtp?.host?.trim() || base.smtp.host,
      port: input.smtp?.port ?? base.smtp.port,
      username: input.smtp?.username?.trim() ?? base.smtp.username,
      password: input.smtp?.password || base.smtp.password,
      tls: input.smtp?.tls ?? base.smtp.tls,
    },
    relay: {
      provider: input.relay?.provider ?? base.relay.provider,
      apiKey: input.relay?.apiKey || base.relay.apiKey,
    },
    dkim: base.dkim,
  };
}

export interface RedactedEmailConfig {
  mode: EmailMode;
  from: string;
  smtp: { host?: string; port: number; username?: string; tls: boolean; hasPassword: boolean };
  relay: { provider: RelayProvider; hasApiKey: boolean };
  dkim: { domain?: string; selector: string; hasKey: boolean };
}

// Admin-facing view of the stored config: never leaks the SMTP password, relay
// API key, or DKIM private key — only whether each is set.
export async function redactedConfig(): Promise<RedactedEmailConfig> {
  const cfg = await getEmailConfig();
  return {
    mode: cfg.mode,
    from: cfg.from,
    smtp: {
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      username: cfg.smtp.username,
      tls: cfg.smtp.tls,
      hasPassword: !!cfg.smtp.password,
    },
    relay: { provider: cfg.relay.provider, hasApiKey: !!cfg.relay.apiKey },
    dkim: { domain: cfg.dkim.domain, selector: cfg.dkim.selector, hasKey: !!cfg.dkim.publicKey },
  };
}
