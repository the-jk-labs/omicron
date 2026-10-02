// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/services/dkim.ts"));

import { config } from "@/config.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { extractAddress } from "@/lib/mime.ts";
import { generateKeyPair } from "@/services/dkim.ts";
import {
  DEFAULT_DKIM_SELECTOR,
  EMAIL_KEYS,
  ensureDkimKeys,
  getEmailConfig,
  getEmailMode,
  redactedConfig,
  resolveCandidate,
  setEmailConfig,
} from "@/services/emailSettings.ts";

let settings: Record<string, unknown>;
const original = { ...config };

beforeEach(() => {
  settings = {};
  vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => settings[key]);
  vi.mocked(settingsRepo.set).mockImplementation(async (key: string, value: unknown) => {
    settings[key] = value;
  });
  vi.mocked(generateKeyPair).mockResolvedValue({ privateKey: "PRIV", publicKey: "PUB" });
  vi.stubEnv("PUBLIC_APP_NAME", undefined);
  vi.stubEnv("EMAIL_FROM", undefined);
  config.APP_DOMAIN = "localhost:5173";
});

afterEach(() => {
  Object.assign(config, original);
});

describe("getEmailMode", () => {
  test("defaults to the env transport", async () => {
    expect(await getEmailMode()).toBe(config.EMAIL_TRANSPORT);
  });

  test.for(["console", "smtp", "relay", "direct"])("a stored %s wins", async (mode) => {
    settings[EMAIL_KEYS.mode] = mode;
    expect(await getEmailMode()).toBe(mode);
  });

  test("an unknown stored mode is ignored", async () => {
    settings[EMAIL_KEYS.mode] = "carrier-pigeon";
    expect(await getEmailMode()).toBe(config.EMAIL_TRANSPORT);
  });
});

describe("getEmailConfig", () => {
  test("a fresh instance gets a fully populated config", async () => {
    expect(await getEmailConfig()).toEqual({
      mode: config.EMAIL_TRANSPORT,
      from: "Omicron <noreply@localhost>",
      smtp: {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        username: config.SMTP_USERNAME,
        password: config.SMTP_PASSWORD,
        tls: config.SMTP_TLS,
      },
      relay: { provider: "resend", apiKey: undefined },
      dkim: { domain: undefined, selector: DEFAULT_DKIM_SELECTOR, privateKey: undefined, publicKey: undefined },
    });
  });

  test("derives From from the wizard name and the bare wizard domain", async () => {
    settings["instance.appName"] = "My Blog";
    settings["instance.appDomain"] = "https://Blog.Example.com:443/x";
    expect((await getEmailConfig()).from).toBe("My Blog <noreply@blog.example.com>");
  });

  test("an explicit From (stored, then env) beats the derived one", async () => {
    vi.stubEnv("EMAIL_FROM", " Env <env@x.test> ");
    expect((await getEmailConfig()).from).toBe("Env <env@x.test>");
    settings[EMAIL_KEYS.from] = "Stored <stored@x.test>";
    expect((await getEmailConfig()).from).toBe("Stored <stored@x.test>");
  });

  test("stored SMTP values win over env, including a false TLS flag and port", async () => {
    config.SMTP_TLS = true;
    Object.assign(settings, {
      [EMAIL_KEYS.smtpHost]: " smtp.example ",
      [EMAIL_KEYS.smtpPort]: 2525,
      [EMAIL_KEYS.smtpUsername]: " user ",
      [EMAIL_KEYS.smtpPassword]: "pw",
      [EMAIL_KEYS.smtpTls]: false,
    });
    expect((await getEmailConfig()).smtp).toEqual({
      host: "smtp.example",
      port: 2525,
      username: "user",
      password: "pw",
      tls: false,
    });
  });

  test("reads relay and DKIM settings", async () => {
    Object.assign(settings, {
      [EMAIL_KEYS.relayApiKey]: "re_123",
      [EMAIL_KEYS.dkimDomain]: " mail.example ",
      [EMAIL_KEYS.dkimSelector]: "  ",
      [EMAIL_KEYS.dkimPrivateKey]: "PRIV",
      [EMAIL_KEYS.dkimPublicKey]: "PUB",
    });
    const cfg = await getEmailConfig();
    expect(cfg.relay).toEqual({ provider: "resend", apiKey: "re_123" });
    expect(cfg.dkim).toEqual({ domain: "mail.example", selector: "omicron", privateKey: "PRIV", publicKey: "PUB" });
  });

  // BUG: the derived From interpolates the admin-chosen instance name as a bare
  // RFC 5322 display name. A name containing a special (",", "<", "\"", …) must
  // be quoted; unquoted, "Ada, Inc." reads as two addresses, and a "<" makes
  // extractAddress pull the wrong envelope sender out of the header.
  test.fails("BUG: quotes an instance name that contains RFC 5322 specials", async () => {
    settings["instance.appName"] = "Ada <3 Blog";
    settings["instance.appDomain"] = "blog.example";
    const { from } = await getEmailConfig();
    expect(extractAddress(from)).toBe("noreply@blog.example");
  });
});

describe("setEmailConfig", () => {
  test("only touches the keys it names, trimmed", async () => {
    await setEmailConfig({ mode: "smtp", from: " A <a@x.test> ", smtp: { host: " h ", port: 465, tls: true } });
    expect(settings).toEqual({
      [EMAIL_KEYS.mode]: "smtp",
      [EMAIL_KEYS.from]: "A <a@x.test>",
      [EMAIL_KEYS.smtpHost]: "h",
      [EMAIL_KEYS.smtpPort]: 465,
      [EMAIL_KEYS.smtpTls]: true,
    });
  });

  test("a blank secret leaves the stored one alone", async () => {
    settings[EMAIL_KEYS.smtpPassword] = "old";
    settings[EMAIL_KEYS.relayApiKey] = "old-key";
    await setEmailConfig({ smtp: { password: "" }, relay: { apiKey: "" } });
    expect(settings[EMAIL_KEYS.smtpPassword]).toBe("old");
    expect(settings[EMAIL_KEYS.relayApiKey]).toBe("old-key");
  });

  test("a new secret replaces the stored one; username may be cleared", async () => {
    settings[EMAIL_KEYS.smtpUsername] = "old";
    await setEmailConfig({ smtp: { password: "new", username: "  " }, relay: { provider: "resend", apiKey: "k" } });
    expect(settings[EMAIL_KEYS.smtpPassword]).toBe("new");
    expect(settings[EMAIL_KEYS.smtpUsername]).toBe("");
    expect(settings[EMAIL_KEYS.relayApiKey]).toBe("k");
    expect(settings[EMAIL_KEYS.relayProvider]).toBe("resend");
  });

  test("an empty input writes nothing", async () => {
    await setEmailConfig({});
    expect(settingsRepo.set).not.toHaveBeenCalled();
  });
});

describe("ensureDkimKeys", () => {
  test("generates and records a keypair on first use", async () => {
    expect(await ensureDkimKeys(" mail.example ")).toEqual({ selector: "omicron", publicKey: "PUB" });
    expect(settings).toMatchObject({
      [EMAIL_KEYS.dkimPrivateKey]: "PRIV",
      [EMAIL_KEYS.dkimPublicKey]: "PUB",
      [EMAIL_KEYS.dkimSelector]: "omicron",
      [EMAIL_KEYS.dkimDomain]: "mail.example",
    });
  });

  test("reuses the existing key for the same domain", async () => {
    Object.assign(settings, { [EMAIL_KEYS.dkimDomain]: "mail.example", [EMAIL_KEYS.dkimPublicKey]: "OLD" });
    expect(await ensureDkimKeys("mail.example")).toEqual({ selector: "omicron", publicKey: "OLD" });
    expect(generateKeyPair).not.toHaveBeenCalled();
  });

  test("rotates the key when the sending domain changes, keeping a custom selector", async () => {
    Object.assign(settings, {
      [EMAIL_KEYS.dkimDomain]: "old.example",
      [EMAIL_KEYS.dkimPublicKey]: "OLD",
      [EMAIL_KEYS.dkimSelector]: "s2026",
    });
    expect(await ensureDkimKeys("new.example")).toEqual({ selector: "s2026", publicKey: "PUB" });
    expect(settings[EMAIL_KEYS.dkimDomain]).toBe("new.example");
  });
});

describe("resolveCandidate", () => {
  test("overlays unsaved input on the effective config", async () => {
    Object.assign(settings, { [EMAIL_KEYS.smtpPassword]: "stored", [EMAIL_KEYS.smtpHost]: "stored.host" });
    const cfg = await resolveCandidate({ mode: "smtp", smtp: { host: " new.host ", port: 2525, password: "" } });
    expect(cfg.mode).toBe("smtp");
    expect(cfg.smtp.host).toBe("new.host");
    expect(cfg.smtp.port).toBe(2525);
    // A blank password in the form means "use the saved one".
    expect(cfg.smtp.password).toBe("stored");
  });

  test("an empty input is the effective config", async () => {
    expect(await resolveCandidate({})).toEqual(await getEmailConfig());
  });

  test("nothing is persisted", async () => {
    await resolveCandidate({ mode: "relay", relay: { apiKey: "k" } });
    expect(settingsRepo.set).not.toHaveBeenCalled();
  });
});

describe("redactedConfig", () => {
  test("reports whether secrets are set without ever including them", async () => {
    Object.assign(settings, {
      [EMAIL_KEYS.smtpPassword]: "hunter2",
      [EMAIL_KEYS.relayApiKey]: "re_secret",
      [EMAIL_KEYS.dkimPrivateKey]: "-----BEGIN PRIVATE KEY-----",
      [EMAIL_KEYS.dkimPublicKey]: "PUB",
    });
    const view = await redactedConfig();
    expect(view.smtp.hasPassword).toBe(true);
    expect(view.relay.hasApiKey).toBe(true);
    expect(view.dkim.hasKey).toBe(true);
    const json = JSON.stringify(view);
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("re_secret");
    expect(json).not.toContain("PRIVATE KEY");
  });

  test("reports unset secrets as false", async () => {
    config.SMTP_PASSWORD = undefined;
    const view = await redactedConfig();
    expect(view.smtp.hasPassword).toBe(false);
    expect(view.relay.hasApiKey).toBe(false);
    expect(view.dkim.hasKey).toBe(false);
  });
});
