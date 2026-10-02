// SPDX-License-Identifier: AGPL-3.0-or-later
// config.ts is evaluated once at import, so every test sets the environment
// first and then imports a fresh copy. No module is mocked: the env vars and a
// throwaway STATE_DIR on disk are the whole input.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const VARS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "SESSION_SECRET_FILE",
  "POSTGRES_PASSWORD",
  "POSTGRES_PASSWORD_FILE",
  "POSTGRES_USER",
  "POSTGRES_DB",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "APP_DOMAIN",
  "FEDERATION_ENABLED",
  "ALLOW_PRIVATE_FEDERATION",
  "PORT",
  "UPLOADS_DIR",
  "REDIS_URL",
  "RATE_LIMIT_ENABLED",
  "WEBHOOK_SECRET",
  "WEBHOOK_AUTHOR",
  "EMAIL_TRANSPORT",
  "EMAIL_FROM",
  "SMTP_TLS",
  "SMTP_PORT",
  "EMAIL_VERIFICATION_REQUIRED",
  "HIBP_CHECK_ENABLED",
  "UPLOAD_GC_GRACE_DAYS",
  "REMOTE_CACHE_RETENTION_DAYS",
];

let stateDir: string;

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), "omicron-config-"));
  for (const name of VARS) vi.stubEnv(name, undefined);
  // Keep tests/test.env out of these tests: each one states its whole input.
  vi.stubEnv("DOTENV_PATH", join(stateDir, "no-such.env"));
  vi.stubEnv("STATE_DIR", stateDir);
  vi.stubEnv("DATABASE_URL", "postgres://u:p@db:5432/omicron");
  vi.stubEnv("SESSION_SECRET", "a-perfectly-good-secret");
});

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

async function load() {
  vi.resetModules();
  return await import("@/config.ts");
}

// Boot failures call process.exit(1); turn that into a catchable error.
function trapExit() {
  vi.spyOn(console, "error").mockImplementation(() => {});
  return vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`exit ${code}`);
  }) as never);
}

describe("defaults", () => {
  test("a minimal environment boots with the documented defaults", async () => {
    const { config } = await load();
    expect(config).toMatchObject({
      APP_DOMAIN: "localhost:5173",
      FEDERATION_ENABLED: true,
      ALLOW_PRIVATE_FEDERATION: false,
      PORT: 8000,
      UPLOADS_DIR: "./uploads",
      REDIS_URL: undefined,
      RATE_LIMIT_ENABLED: true,
      RL_LOGIN_MAX: 15,
      RL_REGISTER_MAX: 5,
      RL_API_WRITE_MAX: 120,
      RL_UPLOAD_MAX: 10,
      RL_INBOX_MAX: 300,
      RL_WEBHOOK_MAX: 30,
      INBOX_MAX_BODY_BYTES: 1_000_000,
      RL_REMOTE_MAX: 30,
      RL_REMOTE_MISS_MAX: 20,
      RL_REMOTE_MAX_OUTBOUND: 10,
      RL_REMOTE_MAX_PER_ORIGIN: 3,
      REMOTE_LOOKUP_TIMEOUT_MS: 10_000,
      REMOTE_NEGATIVE_CACHE_TTL_MS: 60_000,
      REMOTE_CACHE_RETENTION_DAYS: 30,
      UPLOAD_GC_GRACE_DAYS: 30,
      UPLOAD_QUOTA_USER_MB: 200,
      UPLOAD_QUOTA_TOTAL_MB: 2048,
      WEBHOOK_SECRET: undefined,
      WEBHOOK_AUTHOR: undefined,
      WEBHOOK_MAX_BODY_BYTES: 512_000,
      EMAIL_TRANSPORT: "console",
      EMAIL_FROM: "Omicron <no-reply@localhost>",
      SMTP_PORT: 587,
      SMTP_TLS: false,
      EMAIL_VERIFICATION_REQUIRED: true,
      HIBP_CHECK_ENABLED: true,
    });
  });

  test("numeric variables are coerced from strings", async () => {
    vi.stubEnv("PORT", "3001");
    vi.stubEnv("SMTP_PORT", "465");
    const { config } = await load();
    expect(config.PORT).toBe(3001);
    expect(config.SMTP_PORT).toBe(465);
  });

  test("zero is a valid retention (pruning disabled)", async () => {
    vi.stubEnv("REMOTE_CACHE_RETENTION_DAYS", "0");
    const { config } = await load();
    expect(config.REMOTE_CACHE_RETENTION_DAYS).toBe(0);
  });
});

describe("boolean flags", () => {
  // Opt-out flags: anything but "false" (any case) keeps them on.
  test.for([
    ["false", false],
    ["FALSE", false],
    ["False", false],
    ["true", true],
    ["yes", true],
  ] as const)("FEDERATION_ENABLED=%s -> %s", async ([raw, expected]) => {
    vi.stubEnv("FEDERATION_ENABLED", raw);
    expect((await load()).config.FEDERATION_ENABLED).toBe(expected);
  });

  test.for(["RATE_LIMIT_ENABLED", "EMAIL_VERIFICATION_REQUIRED", "HIBP_CHECK_ENABLED"] as const)(
    "%s is switched off only by 'false'",
    async (name) => {
      vi.stubEnv(name, "false");
      expect((await load()).config[name]).toBe(false);
    },
  );

  // Opt-in flags: only "true" (any case) turns them on.
  test.for([
    ["true", true],
    ["TRUE", true],
    ["1", false],
    ["yes", false],
  ] as const)("ALLOW_PRIVATE_FEDERATION=%s -> %s", async ([raw, expected]) => {
    vi.stubEnv("ALLOW_PRIVATE_FEDERATION", raw);
    expect((await load()).config.ALLOW_PRIVATE_FEDERATION).toBe(expected);
  });

  test("SMTP_TLS is opt-in", async () => {
    vi.stubEnv("SMTP_TLS", "true");
    expect((await load()).config.SMTP_TLS).toBe(true);
  });
});

describe("DATABASE_URL", () => {
  test("an explicit DATABASE_URL is used as-is (trimmed)", async () => {
    vi.stubEnv("DATABASE_URL", "  postgres://a:b@host:1234/x  ");
    expect((await load()).config.DATABASE_URL).toBe("postgres://a:b@host:1234/x");
  });

  test("is assembled from POSTGRES_PASSWORD with compose defaults", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("POSTGRES_PASSWORD", "pw");
    expect((await load()).config.DATABASE_URL).toBe("postgres://omicron:pw@postgres:5432/omicron");
  });

  test("honours every POSTGRES_* part", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("POSTGRES_PASSWORD", "pw");
    vi.stubEnv("POSTGRES_USER", "blog");
    vi.stubEnv("POSTGRES_DB", "blogdb");
    vi.stubEnv("POSTGRES_HOST", "db.internal");
    vi.stubEnv("POSTGRES_PORT", "6543");
    expect((await load()).config.DATABASE_URL).toBe("postgres://blog:pw@db.internal:6543/blogdb");
  });

  test("percent-encodes a password with URL-significant characters", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("POSTGRES_PASSWORD", "p@ss/w:rd#?");
    const { config } = await load();
    expect(config.DATABASE_URL).toBe(`postgres://omicron:${encodeURIComponent("p@ss/w:rd#?")}@postgres:5432/omicron`);
    expect(decodeURIComponent(new URL(config.DATABASE_URL).password)).toBe("p@ss/w:rd#?");
  });

  test("prefers the password file over POSTGRES_PASSWORD", async () => {
    const file = join(stateDir, "db_password");
    writeFileSync(file, "from-file\n");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("POSTGRES_PASSWORD_FILE", file);
    vi.stubEnv("POSTGRES_PASSWORD", "from-env");
    expect((await load()).config.DATABASE_URL).toBe("postgres://omicron:from-file@postgres:5432/omicron");
  });

  test("falls back to POSTGRES_PASSWORD when the password file is missing or blank", async () => {
    const blank = join(stateDir, "blank");
    writeFileSync(blank, "   \n");
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("POSTGRES_PASSWORD_FILE", blank);
    vi.stubEnv("POSTGRES_PASSWORD", "from-env");
    expect((await load()).config.DATABASE_URL).toContain(":from-env@");

    vi.stubEnv("POSTGRES_PASSWORD_FILE", join(stateDir, "missing"));
    expect((await load()).config.DATABASE_URL).toContain(":from-env@");
  });

  test("exits when no database can be configured", async () => {
    const exit = trapExit();
    vi.stubEnv("DATABASE_URL", undefined);
    await expect(load()).rejects.toThrow("exit 1");
    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("No database configured");
  });

  test("exits on a DATABASE_URL that is not a URL", async () => {
    trapExit();
    vi.stubEnv("DATABASE_URL", "not a url");
    await expect(load()).rejects.toThrow("exit 1");
  });

  test("percent-encodes a POSTGRES_USER containing a colon", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("POSTGRES_PASSWORD", "pw");
    vi.stubEnv("POSTGRES_USER", "blog:ops");
    const url = new URL((await load()).config.DATABASE_URL);
    expect(decodeURIComponent(url.username)).toBe("blog:ops");
    expect(url.password).toBe("pw");
  });
});

describe("session secret", () => {
  test("an explicit SESSION_SECRET wins and is not managed", async () => {
    const mod = await load();
    expect(mod.config.SESSION_SECRET).toBe("a-perfectly-good-secret");
    expect(mod.sessionSecretManaged()).toBe(false);
    expect(existsSync(join(stateDir, "session_secret"))).toBe(false);
  });

  test("the shipped placeholder counts as unset", async () => {
    vi.stubEnv("SESSION_SECRET", "change-me-please-use-a-long-random-string");
    const mod = await load();
    expect(mod.config.SESSION_SECRET).not.toBe("change-me-please-use-a-long-random-string");
    expect(mod.sessionSecretManaged()).toBe(true);
  });

  test("a rotated secret in STATE_DIR beats SESSION_SECRET_FILE", async () => {
    vi.stubEnv("SESSION_SECRET", undefined);
    writeFileSync(join(stateDir, "session_secret"), "rotated-secret\n");
    const file = join(stateDir, "bootstrap");
    writeFileSync(file, "bootstrap-secret");
    vi.stubEnv("SESSION_SECRET_FILE", file);
    expect((await load()).config.SESSION_SECRET).toBe("rotated-secret");
  });

  test("SESSION_SECRET_FILE is used when nothing was rotated", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    const file = join(stateDir, "bootstrap");
    writeFileSync(file, "  bootstrap-secret \n");
    vi.stubEnv("SESSION_SECRET_FILE", file);
    const mod = await load();
    expect(mod.config.SESSION_SECRET).toBe("bootstrap-secret");
    expect(mod.sessionSecretManaged()).toBe(true);
  });

  test("generates and persists a secret when none is supplied, and reuses it next boot", async () => {
    vi.stubEnv("SESSION_SECRET", undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const first = (await load()).config.SESSION_SECRET;
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(stateDir, "session_secret"), "utf8")).toBe(first);
    expect((await load()).config.SESSION_SECRET).toBe(first);
  });

  test("creates a missing STATE_DIR", async () => {
    const nested = join(stateDir, "a", "b");
    vi.stubEnv("STATE_DIR", nested);
    vi.stubEnv("SESSION_SECRET", undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await load();
    expect(existsSync(join(nested, "session_secret"))).toBe(true);
  });

  test("falls back to an ephemeral secret when STATE_DIR cannot be written", async () => {
    // A file where the directory should be makes mkdir fail.
    const blocker = join(stateDir, "blocker");
    writeFileSync(blocker, "");
    vi.stubEnv("STATE_DIR", join(blocker, "state"));
    vi.stubEnv("SESSION_SECRET", undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config } = await load();
    expect(config.SESSION_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ephemeral secret"));
  });

  test("rotateSessionSecret writes a fresh secret for the next boot", async () => {
    vi.stubEnv("SESSION_SECRET", undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const mod = await load();
    const before = mod.config.SESSION_SECRET;
    mod.rotateSessionSecret();
    const after = readFileSync(join(stateDir, "session_secret"), "utf8");
    expect(after).toMatch(/^[0-9a-f]{64}$/);
    expect(after).not.toBe(before);
    // The running process keeps the old secret until restart.
    expect(mod.config.SESSION_SECRET).toBe(before);
  });

  test("rotateSessionSecret refuses when the secret is pinned in the environment", async () => {
    const mod = await load();
    expect(() => mod.rotateSessionSecret()).toThrow("pinned via the SESSION_SECRET env var");
    expect(existsSync(join(stateDir, "session_secret"))).toBe(false);
  });

  test("a secret shorter than 8 characters is refused at boot", async () => {
    trapExit();
    vi.stubEnv("SESSION_SECRET", "short");
    await expect(load()).rejects.toThrow("exit 1");
  });

  test.skipIf(process.platform === "win32")("the generated secret file is owner-only", async () => {
    vi.stubEnv("SESSION_SECRET", undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await load();
    expect(statSync(join(stateDir, "session_secret")).mode & 0o777).toBe(0o600);
  });
});

describe("webhook settings", () => {
  test("a blank WEBHOOK_SECRET means disabled, not an empty secret", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "   ");
    vi.stubEnv("WEBHOOK_AUTHOR", "  ");
    const { config } = await load();
    expect(config.WEBHOOK_SECRET).toBeUndefined();
    expect(config.WEBHOOK_AUTHOR).toBeUndefined();
  });

  test("the secret and author are trimmed", async () => {
    vi.stubEnv("WEBHOOK_SECRET", "  0123456789abcdef  ");
    vi.stubEnv("WEBHOOK_AUTHOR", " ada ");
    const { config } = await load();
    expect(config.WEBHOOK_SECRET).toBe("0123456789abcdef");
    expect(config.WEBHOOK_AUTHOR).toBe("ada");
  });

  test("a WEBHOOK_SECRET under 16 characters is refused at boot", async () => {
    trapExit();
    vi.stubEnv("WEBHOOK_SECRET", "too-short");
    await expect(load()).rejects.toThrow("exit 1");
  });
});

describe("invalid values fail fast", () => {
  test.for([
    ["PORT", "0"],
    ["PORT", "-1"],
    ["PORT", "eighty"],
    ["PORT", "80.5"],
    ["EMAIL_TRANSPORT", "sendmail"],
    ["REDIS_URL", "not-a-url"],
    ["UPLOAD_GC_GRACE_DAYS", "0"],
    ["REMOTE_CACHE_RETENTION_DAYS", "-1"],
  ] as const)("%s=%j exits", async ([name, value]) => {
    trapExit();
    vi.stubEnv(name, value);
    await expect(load()).rejects.toThrow("exit 1");
  });

  test("a blank REDIS_URL is treated as unset", async () => {
    trapExit();
    vi.stubEnv("REDIS_URL", "");
    expect((await load()).config.REDIS_URL).toBeUndefined();
  });
});

describe("dotenv", () => {
  test("loads unset variables from the DOTENV_PATH file", async () => {
    const file = join(stateDir, "custom.env");
    writeFileSync(file, "APP_DOMAIN=blog.example.com\nRL_LOGIN_MAX=42\n");
    vi.stubEnv("DOTENV_PATH", file);
    vi.stubEnv("APP_DOMAIN", undefined);
    vi.stubEnv("RL_LOGIN_MAX", undefined);
    const { config } = await load();
    expect(config.APP_DOMAIN).toBe("blog.example.com");
    expect(config.RL_LOGIN_MAX).toBe(42);
  });

  test("never overrides a variable the real environment already set", async () => {
    const file = join(stateDir, "custom.env");
    writeFileSync(file, "APP_DOMAIN=from-file.example\n");
    vi.stubEnv("DOTENV_PATH", file);
    vi.stubEnv("APP_DOMAIN", "from-env.example");
    expect((await load()).config.APP_DOMAIN).toBe("from-env.example");
  });

  test("a missing .env file is fine", async () => {
    mkdirSync(join(stateDir, "empty"));
    vi.stubEnv("DOTENV_PATH", join(stateDir, "empty", ".env"));
    expect((await load()).config.APP_DOMAIN).toBe("localhost:5173");
  });
});
