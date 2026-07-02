// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

// Centralized, validated environment config. Fail fast on misconfiguration.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_DOMAIN: z.string().min(1),
  FEDERATION_ENABLED: z
    .string()
    .transform((v) => v.toLowerCase() !== "false")
    .default(true),
  SESSION_SECRET: z.string().min(8),
  PORT: z.coerce.number().int().positive().default(8000),
  UPLOADS_DIR: z.string().min(1).default("./uploads"),

  // Rate limiting. Disable only when a trusted upstream (CDN/gateway) already
  // enforces limits. The per-limiter maxima below are the request budgets;
  // windows are fixed in code (see routes/auth.ts and app.ts).
  RATE_LIMIT_ENABLED: z
    .string()
    .transform((v) => v.toLowerCase() !== "false")
    .default(true),
  RL_LOGIN_MAX: z.coerce.number().int().positive().default(15),
  RL_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  RL_API_WRITE_MAX: z.coerce.number().int().positive().default(120),
  RL_INBOX_MAX: z.coerce.number().int().positive().default(300),
  // Reject federation inbox POSTs whose declared body exceeds this many bytes.
  INBOX_MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_000_000),

  // Email. Transactional mail (password reset, verification). The default
  // `console` transport just logs the message + link to stdout, so the whole
  // flow works out of the box for local dev and single-user instances without
  // any SMTP setup. Switch to `smtp` and fill the SMTP_* vars for real delivery.
  EMAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().min(1).default("Omicron <no-reply@localhost>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // Implicit TLS (port 465). When false, a STARTTLS upgrade is used (port 587).
  SMTP_TLS: z
    .string()
    .transform((v) => v.toLowerCase() === "true")
    .default(false),

  // When true, new accounts must confirm their email before they can sign in
  // (the gate for closed/invite instances). When false, verification mail is
  // still sent as a courtesy but never blocks access.
  EMAIL_VERIFICATION_REQUIRED: z
    .string()
    .transform((v) => v.toLowerCase() === "true")
    .default(false),
});

function load() {
  const parsed = schema.safeParse({
    DATABASE_URL: Deno.env.get("DATABASE_URL"),
    APP_DOMAIN: Deno.env.get("APP_DOMAIN"),
    FEDERATION_ENABLED: Deno.env.get("FEDERATION_ENABLED"),
    SESSION_SECRET: Deno.env.get("SESSION_SECRET"),
    PORT: Deno.env.get("PORT"),
    UPLOADS_DIR: Deno.env.get("UPLOADS_DIR"),
    RATE_LIMIT_ENABLED: Deno.env.get("RATE_LIMIT_ENABLED"),
    RL_LOGIN_MAX: Deno.env.get("RL_LOGIN_MAX"),
    RL_REGISTER_MAX: Deno.env.get("RL_REGISTER_MAX"),
    RL_API_WRITE_MAX: Deno.env.get("RL_API_WRITE_MAX"),
    RL_INBOX_MAX: Deno.env.get("RL_INBOX_MAX"),
    INBOX_MAX_BODY_BYTES: Deno.env.get("INBOX_MAX_BODY_BYTES"),
    EMAIL_TRANSPORT: Deno.env.get("EMAIL_TRANSPORT"),
    EMAIL_FROM: Deno.env.get("EMAIL_FROM"),
    SMTP_HOST: Deno.env.get("SMTP_HOST"),
    SMTP_PORT: Deno.env.get("SMTP_PORT"),
    SMTP_USERNAME: Deno.env.get("SMTP_USERNAME"),
    SMTP_PASSWORD: Deno.env.get("SMTP_PASSWORD"),
    SMTP_TLS: Deno.env.get("SMTP_TLS"),
    EMAIL_VERIFICATION_REQUIRED: Deno.env.get("EMAIL_VERIFICATION_REQUIRED"),
  });

  if (!parsed.success) {
    console.error("❌ Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    Deno.exit(1);
  }
  return parsed.data;
}

export const config = load();

// The instance origin (scheme + domain). https unless a localhost dev domain.
export const origin = `${
  config.APP_DOMAIN.startsWith("localhost") ? "http" : "https"
}://${config.APP_DOMAIN}`;
