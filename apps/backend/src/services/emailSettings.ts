// SPDX-License-Identifier: AGPL-3.0-or-later
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { config } from "@/config.ts";

// Web-managed email configuration, layered over the instance_settings key/value
// store exactly like the instance identity (see instanceSetup.ts). The operator
// sets everything from the setup wizard or the admin page — no SMTP_* env vars to
// hand-edit. Precedence for every effective value is DB (wizard/admin) →
// environment → built-in default, so an existing env-configured instance keeps
// working unchanged.

export type EmailMode = "console" | "smtp";

export const EMAIL_KEYS = {
  mode: "email.mode",
  from: "email.from",
  smtpHost: "email.smtp.host",
  smtpPort: "email.smtp.port",
  smtpUsername: "email.smtp.username",
  smtpPassword: "email.smtp.password",
  smtpTls: "email.smtp.tls",
} as const;

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
}

// The effective, ready-to-send configuration. Every field falls back through
// env then a built-in default, so this is always fully populated.
export async function getEmailConfig(): Promise<EmailConfig> {
  const [mode, from, host, port, username, password, tls] = await Promise.all([
    settingsRepo.get<string>(EMAIL_KEYS.mode),
    settingsRepo.get<string>(EMAIL_KEYS.from),
    settingsRepo.get<string>(EMAIL_KEYS.smtpHost),
    settingsRepo.get<number>(EMAIL_KEYS.smtpPort),
    settingsRepo.get<string>(EMAIL_KEYS.smtpUsername),
    settingsRepo.get<string>(EMAIL_KEYS.smtpPassword),
    settingsRepo.get<boolean>(EMAIL_KEYS.smtpTls),
  ]);
  const resolvedMode: EmailMode = mode === "smtp" || mode === "console"
    ? mode
    : config.EMAIL_TRANSPORT;
  return {
    mode: resolvedMode,
    from: from?.trim() || config.EMAIL_FROM,
    smtp: {
      host: host?.trim() || config.SMTP_HOST,
      port: port ?? config.SMTP_PORT,
      username: username?.trim() || config.SMTP_USERNAME,
      password: password ?? config.SMTP_PASSWORD,
      tls: tls ?? config.SMTP_TLS,
    },
  };
}

// Input accepted from the wizard / admin page. Everything is optional so a
// partial update (e.g. just flipping the mode, or fixing the password) only
// touches the keys it names. An empty password is treated as "unchanged" so the
// admin can re-save the form without re-entering the stored secret.
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
    // Never clobber a stored password with a blank — blank means "leave as is".
    if (s.password) await settingsRepo.set(EMAIL_KEYS.smtpPassword, s.password);
    if (s.tls !== undefined) await settingsRepo.set(EMAIL_KEYS.smtpTls, s.tls);
  }
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
  };
}

// Admin-facing view of the stored config: never leaks the SMTP password, just
// whether one is set. Safe to return from an authenticated admin endpoint.
export async function redactedConfig(): Promise<
  Omit<EmailConfig, "smtp"> & {
    smtp: Omit<EmailConfig["smtp"], "password"> & { hasPassword: boolean };
  }
> {
  const cfg = await getEmailConfig();
  const { password, ...smtp } = cfg.smtp;
  return { mode: cfg.mode, from: cfg.from, smtp: { ...smtp, hasPassword: !!password } };
}
