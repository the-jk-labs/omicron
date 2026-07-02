// SPDX-License-Identifier: AGPL-3.0-or-later
import { z } from "zod";

// The shipped placeholder from older .env.example files — treat it as "unset"
// so an operator who never edited it still gets a real generated secret.
const PLACEHOLDER_SECRET = "change-me-please-use-a-long-random-string";

// Where generated secrets are persisted when nothing is supplied (the
// zero-config path). In docker compose this maps to a small persistent volume;
// locally it defaults to ./.state. Kept out of UPLOADS_DIR so a secret can
// never be served as media.
const STATE_DIR = Deno.env.get("STATE_DIR")?.trim() || "./.state";

function readFileTrimmed(path?: string | null): string | undefined {
  if (!path) return undefined;
  try {
    return Deno.readTextFileSync(path).trim() || undefined;
  } catch {
    return undefined;
  }
}

function randomHex(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Resolve the session secret without ever forcing the operator to invent one:
//   explicit SESSION_SECRET env → SESSION_SECRET_FILE → generate & persist.
function resolveSessionSecret(): string {
  const fromEnv = Deno.env.get("SESSION_SECRET")?.trim();
  if (fromEnv && fromEnv !== PLACEHOLDER_SECRET) return fromEnv;

  const fromFile = readFileTrimmed(Deno.env.get("SESSION_SECRET_FILE"));
  if (fromFile) return fromFile;

  // Nothing supplied — generate once and persist so sessions survive restarts
  // and upgrades. This is the toy-easy default for local/dev and single-node.
  const path = `${STATE_DIR}/session_secret`;
  const existing = readFileTrimmed(path);
  if (existing) return existing;

  const secret = randomHex(32);
  try {
    Deno.mkdirSync(STATE_DIR, { recursive: true });
    Deno.writeTextFileSync(path, secret, { mode: 0o600 });
    console.log(`🔑 No SESSION_SECRET set — generated and persisted one at ${path}.`);
  } catch (err) {
    console.warn(
      `⚠️  Could not persist a generated SESSION_SECRET to ${path}: ${err}. ` +
        `Using an ephemeral secret — sessions will not survive a restart.`,
    );
  }
  return secret;
}

// Resolve the database URL: explicit DATABASE_URL, or assemble it from
// POSTGRES_* parts with the password read from a Docker secret file
// (POSTGRES_PASSWORD_FILE) or POSTGRES_PASSWORD. Lets compose run without a
// hardcoded connection string or a known-default password.
function resolveDatabaseUrl(): string | undefined {
  const explicit = Deno.env.get("DATABASE_URL")?.trim();
  if (explicit) return explicit;

  const password = readFileTrimmed(Deno.env.get("POSTGRES_PASSWORD_FILE")) ??
    Deno.env.get("POSTGRES_PASSWORD")?.trim();
  if (!password) return undefined;

  const user = Deno.env.get("POSTGRES_USER")?.trim() || "omicron";
  const dbname = Deno.env.get("POSTGRES_DB")?.trim() || "omicron";
  const host = Deno.env.get("POSTGRES_HOST")?.trim() || "postgres";
  const port = Deno.env.get("POSTGRES_PORT")?.trim() || "5432";
  return `postgres://${user}:${encodeURIComponent(password)}@${host}:${port}/${dbname}`;
}

// Centralized, validated environment config. Fail fast on misconfiguration.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  // Optional at boot: defaults to localhost so the app is reachable before the
  // setup wizard sets the real public domain (see pre-release.md S1).
  APP_DOMAIN: z.string().min(1).default("localhost:5173"),
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
    DATABASE_URL: resolveDatabaseUrl(),
    APP_DOMAIN: Deno.env.get("APP_DOMAIN"),
    FEDERATION_ENABLED: Deno.env.get("FEDERATION_ENABLED"),
    SESSION_SECRET: resolveSessionSecret(),
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
    if (parsed.error.flatten().fieldErrors.DATABASE_URL) {
      console.error(
        "   No database configured. Set DATABASE_URL, or provide POSTGRES_PASSWORD_FILE / " +
          "POSTGRES_PASSWORD (with optional POSTGRES_USER/DB/HOST/PORT).",
      );
    }
    Deno.exit(1);
  }
  return parsed.data;
}

export const config = load();

// The instance origin (scheme + domain). https unless a localhost dev domain.
export const origin = `${
  config.APP_DOMAIN.startsWith("localhost") ? "http" : "https"
}://${config.APP_DOMAIN}`;
