// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/emailSettings.ts"));

import { config } from "@/config.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { getEmailMode, setEmailConfig } from "@/services/emailSettings.ts";
import { seedFederationRunning } from "@/services/federationState.ts";
import {
  completeSetup,
  getAppDomain,
  getAppName,
  getBannerImageUrl,
  getBannerText,
  getFederationEnabled,
  getOrigin,
  isSetupComplete,
  isTlsDomainAllowed,
  publicInfo,
  SETUP_KEYS,
  setBannerImageUrl,
  setFederationEnabled,
  setInstanceIdentity,
} from "@/services/instanceSetup.ts";

let settings: Record<string, unknown>;
const originalDomain = config.APP_DOMAIN;

beforeEach(() => {
  settings = {};
  vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => settings[key]);
  vi.mocked(settingsRepo.set).mockImplementation(async (key: string, value: unknown) => {
    settings[key] = value;
  });
  vi.mocked(usersRepo.countUsers).mockResolvedValue(0);
  vi.mocked(getEmailMode).mockResolvedValue("console");
  vi.stubEnv("PUBLIC_APP_NAME", undefined);
});

afterEach(() => {
  config.APP_DOMAIN = originalDomain;
});

describe("isSetupComplete", () => {
  test("is false on a fresh instance", async () => {
    expect(await isSetupComplete()).toBe(false);
  });

  test("is true once the wizard finished", async () => {
    settings[SETUP_KEYS.completed] = true;
    expect(await isSetupComplete()).toBe(true);
    expect(usersRepo.countUsers).not.toHaveBeenCalled();
  });

  test("is true for a pre-wizard instance that already has accounts", async () => {
    vi.mocked(usersRepo.countUsers).mockResolvedValue(1);
    expect(await isSetupComplete()).toBe(true);
  });

  test("a stored non-true value does not count as complete", async () => {
    settings[SETUP_KEYS.completed] = "true";
    expect(await isSetupComplete()).toBe(false);
  });
});

describe("name, domain and origin", () => {
  test("name: wizard -> PUBLIC_APP_NAME -> Omicron", async () => {
    expect(await getAppName()).toBe("Omicron");
    vi.stubEnv("PUBLIC_APP_NAME", " From Env ");
    expect(await getAppName()).toBe("From Env");
    settings[SETUP_KEYS.appName] = "  From Wizard  ";
    expect(await getAppName()).toBe("From Wizard");
    settings[SETUP_KEYS.appName] = "   ";
    expect(await getAppName()).toBe("From Env");
  });

  test("domain: wizard -> APP_DOMAIN", async () => {
    config.APP_DOMAIN = "env.example";
    expect(await getAppDomain()).toBe("env.example");
    settings[SETUP_KEYS.appDomain] = " wizard.example ";
    expect(await getAppDomain()).toBe("wizard.example");
    settings[SETUP_KEYS.appDomain] = "";
    expect(await getAppDomain()).toBe("env.example");
  });

  test("origin is https for a real domain and http for localhost", async () => {
    settings[SETUP_KEYS.appDomain] = "blog.example.com";
    expect(await getOrigin()).toBe("https://blog.example.com");
    settings[SETUP_KEYS.appDomain] = "localhost:5173";
    expect(await getOrigin()).toBe("http://localhost:5173");
  });

  test("a domain saved with a scheme does not double the scheme", async () => {
    settings[SETUP_KEYS.appDomain] = "https://blog.example.com/";
    expect(await getOrigin()).toBe("https://blog.example.com");
  });
});

describe("federation toggle", () => {
  test("stored boolean wins over the env default", async () => {
    expect(await getFederationEnabled()).toBe(config.FEDERATION_ENABLED);
    await setFederationEnabled(!config.FEDERATION_ENABLED);
    expect(await getFederationEnabled()).toBe(!config.FEDERATION_ENABLED);
  });

  test("a non-boolean stored value is ignored", async () => {
    settings[SETUP_KEYS.federationEnabled] = "false";
    expect(await getFederationEnabled()).toBe(config.FEDERATION_ENABLED);
  });
});

describe("isTlsDomainAllowed", () => {
  test.for(["", "localhost", "LOCALHOST", "app.localhost", "https://localhost/"])(
    "never issues for %j",
    async (domain) => {
      expect(await isTlsDomainAllowed(domain)).toBe(false);
    },
  );

  test("before setup, any real hostname is allowed (bootstrap window)", async () => {
    expect(await isTlsDomainAllowed("whatever.example")).toBe(true);
  });

  test("after setup, only the saved domain and its www alias", async () => {
    settings[SETUP_KEYS.completed] = true;
    settings[SETUP_KEYS.appDomain] = "https://Blog.Example.com:443/path";
    expect(await isTlsDomainAllowed("blog.example.com")).toBe(true);
    expect(await isTlsDomainAllowed("BLOG.example.com:443")).toBe(true);
    expect(await isTlsDomainAllowed("www.blog.example.com")).toBe(true);
    expect(await isTlsDomainAllowed("evil.example.com")).toBe(false);
    expect(await isTlsDomainAllowed("blog.example.com.evil.net")).toBe(false);
    expect(await isTlsDomainAllowed("www.www.blog.example.com")).toBe(false);
  });

  test("after setup with only a localhost domain, nothing is issued", async () => {
    settings[SETUP_KEYS.completed] = true;
    config.APP_DOMAIN = "localhost:5173";
    expect(await isTlsDomainAllowed("blog.example.com")).toBe(false);
  });
});

describe("setInstanceIdentity", () => {
  test("saves trimmed values; a blank name is ignored", async () => {
    await setInstanceIdentity({ appName: "   ", appDomain: " x.example ", bannerText: " hi " });
    expect(settings).toEqual({ [SETUP_KEYS.appDomain]: "x.example", [SETUP_KEYS.bannerText]: "hi" });
  });

  test("an explicit empty domain or banner is stored so it reverts to the default", async () => {
    await setInstanceIdentity({ appDomain: "", bannerText: "" });
    expect(settings[SETUP_KEYS.appDomain]).toBe("");
    expect(settings[SETUP_KEYS.bannerText]).toBe("");
    expect(await getBannerText()).toBe(null);
  });

  test("undefined fields are left untouched", async () => {
    settings[SETUP_KEYS.bannerText] = "keep";
    await setInstanceIdentity({ appName: "New" });
    expect(settings[SETUP_KEYS.bannerText]).toBe("keep");
    expect(settings[SETUP_KEYS.appName]).toBe("New");
  });
});

describe("banner", () => {
  test("image URL round-trips and null clears it", async () => {
    expect(await getBannerImageUrl()).toBe(null);
    await setBannerImageUrl("/api/uploads/x.png");
    expect(await getBannerImageUrl()).toBe("/api/uploads/x.png");
    await setBannerImageUrl(null);
    expect(settings[SETUP_KEYS.bannerImageUrl]).toBe("");
    expect(await getBannerImageUrl()).toBe(null);
  });
});

describe("publicInfo", () => {
  test("is a safe snapshot of the instance", async () => {
    settings[SETUP_KEYS.appName] = "My Blog";
    settings[SETUP_KEYS.appDomain] = "blog.example";
    settings[SETUP_KEYS.completed] = true;
    seedFederationRunning(true);
    vi.mocked(getEmailMode).mockResolvedValue("smtp");
    expect(await publicInfo()).toEqual({
      name: "My Blog",
      domain: "blog.example",
      federationEnabled: true,
      setupComplete: true,
      emailEnabled: true,
      emailVerificationRequired: config.EMAIL_VERIFICATION_REQUIRED,
      bannerText: null,
      bannerImageUrl: null,
    });
    seedFederationRunning(false);
  });

  test("email is disabled on the console transport", async () => {
    expect((await publicInfo()).emailEnabled).toBe(false);
  });
});

describe("completeSetup", () => {
  test("saves the identity, email settings and the completed flag", async () => {
    const email = { mode: "smtp" } as never;
    await completeSetup({ appName: " Blog ", appDomain: " blog.example ", email });
    expect(settings).toEqual({
      [SETUP_KEYS.appName]: "Blog",
      [SETUP_KEYS.appDomain]: "blog.example",
      [SETUP_KEYS.completed]: true,
    });
    expect(setEmailConfig).toHaveBeenCalledWith(email);
    expect(await isSetupComplete()).toBe(true);
  });

  test("blank optional fields keep the env defaults", async () => {
    await completeSetup({ appName: "  ", appDomain: "  " });
    expect(settings).toEqual({ [SETUP_KEYS.completed]: true });
    expect(setEmailConfig).not.toHaveBeenCalled();
  });
});
