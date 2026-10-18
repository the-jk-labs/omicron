// SPDX-License-Identifier: AGPL-3.0-or-later
// The Caddyfile is a real file on disk and Caddy's admin API is the fetch
// boundary. The module reads CADDY_ADMIN_URL / CADDYFILE_PATH at import, so each
// test sets the environment and imports a fresh copy.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// readFile is a pass-through spy: the reconcile tests resolve it instantly so
// their retry loop can run on fake time without waiting on real I/O.
vi.mock(import("node:fs/promises"), async (importOriginal) => {
  const fs = await importOriginal();
  return { ...fs, readFile: vi.fn<typeof fs.readFile>(fs.readFile) as typeof fs.readFile };
});
vi.mock(import("@/db/repositories/instanceSettings.ts"));
vi.mock(import("@/lib/unixHttp.ts"));

import { readFile } from "node:fs/promises";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { routeThroughAnubis } from "@/lib/caddyfile.ts";
import { postUnix } from "@/lib/unixHttp.ts";
import { renderAccessRules } from "@/services/accessRules.ts";

const CADDYFILE = `{$APP_DOMAIN} {
\treverse_proxy /api/* backend:8000
\t# managed-access-rules
\treverse_proxy frontend:3000
}
`;

let tmp: string;
let settings: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.spyOn>;

const UNSET = Symbol("unset");

async function load(adminUrl: string | typeof UNSET = "http://caddy:2019") {
  vi.stubEnv("CADDY_ADMIN_URL", adminUrl === UNSET ? undefined : adminUrl);
  vi.stubEnv("CADDYFILE_PATH", join(tmp, "Caddyfile"));
  vi.resetModules();
  return await import("@/services/anubisProtection.ts");
}

beforeEach(() => {
  vi.stubEnv("CADDY_ADMIN_SOCKET", "");
  tmp = mkdtempSync(join(tmpdir(), "omicron-caddy-"));
  writeFileSync(join(tmp, "Caddyfile"), CADDYFILE);
  settings = {};
  vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => settings[key]);
  vi.mocked(settingsRepo.set).mockImplementation(async (key: string, value: unknown) => {
    settings[key] = value;
  });
  fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(tmp, { recursive: true, force: true });
});

describe("anubisManaged", () => {
  test.for([
    [UNSET, false],
    ["", false],
    ["   ", false],
    ["http://caddy:2019", true],
  ] as const)("CADDY_ADMIN_URL=%s -> %s", async ([url, managed]) => {
    expect((await load(url)).anubisManaged()).toBe(managed);
  });
});

test("protection is off by default", async () => {
  expect(await (await load()).anubisProtectionEnabled()).toBe(false);
});

describe("IP access rules", () => {
  const input = { network: "192.0.2.129/24", action: "block" as const, reason: " Test ", expiresInHours: 24 };

  test("adds, disables, re-enables and removes a temporary normalized rule", async () => {
    const mod = await load();
    const [rule] = await mod.addAccessRule(input);
    expect(rule).toMatchObject({ network: "192.0.2.0/24", action: "block", reason: "Test", enabled: true });
    expect(Date.parse(rule.expiresAt) - Date.parse(rule.createdAt)).toBeGreaterThanOrEqual(86400000);
    expect(fetchMock.mock.calls[0][1].body).toBe(renderAccessRules(CADDYFILE, [rule]));
    expect(settings["security.accessRules"]).toEqual([rule]);
    expect((await mod.updateAccessRule(rule.id, false))[0].enabled).toBe(false);
    expect((await mod.updateAccessRule(rule.id, true))[0].enabled).toBe(true);
    expect(await mod.updateAccessRule(rule.id, null)).toEqual([]);
    expect(fetchMock.mock.calls.at(-1)[1].body).toBe(CADDYFILE);
  });

  test("retains rules when the proof-of-work switch changes", async () => {
    const mod = await load();
    const rules = await mod.addAccessRule(input);
    await mod.setAnubisProtectionEnabled(true);
    expect(fetchMock.mock.calls.at(-1)[1].body).toBe(renderAccessRules(routeThroughAnubis(CADDYFILE), rules));
    await mod.setAnubisProtectionEnabled(false);
    expect(fetchMock.mock.calls.at(-1)[1].body).toBe(renderAccessRules(CADDYFILE, rules));
  });

  test("rejected configuration leaves the database unchanged", async () => {
    const mod = await load();
    fetchMock.mockResolvedValue(new Response("bad config", { status: 400 }));
    await expect(mod.addAccessRule(input)).rejects.toThrow("bad config");
    expect(settings).toEqual({});
  });

  test("database failure restores the previous proxy configuration", async () => {
    const mod = await load();
    vi.mocked(settingsRepo.set).mockRejectedValueOnce(new Error("database unavailable"));
    await expect(mod.addAccessRule(input)).rejects.toThrow("database unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(CADDYFILE);
    expect(settings).toEqual({});
  });

  test("simultaneous edits are serialized without dropping either rule", async () => {
    const mod = await load();
    await Promise.all([mod.addAccessRule(input), mod.addAccessRule({ ...input, network: "198.51.100.1" })]);
    expect(await mod.accessRules()).toHaveLength(2);
  });

  test("a draft is tested first without persisting or applying anything", async () => {
    const mod = await load();
    await mod.addAccessRule(input);
    fetchMock.mockClear();
    expect(
      await mod.previewAccessRules("192.0.2.1", "/search", { network: "192.0.2.1", action: "allow" }),
    ).toMatchObject({ action: "allow", ruleId: "draft" });
    expect(await mod.accessRules()).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await mod.previewAccessRules("192.0.2.1", "/admin")).toMatchObject({ action: "exempt" });
  });

  test("invalid networks, unknown rules, expired rules and invalid durations are rejected", async () => {
    const mod = await load();
    await expect(mod.addAccessRule({ ...input, network: "bad" })).rejects.toThrow(/valid IPv4 or IPv6/);
    await expect(mod.addAccessRule({ ...input, expiresInHours: -1 })).rejects.toThrow(/expiry/);
    await expect(mod.updateAccessRule("unknown", false)).rejects.toThrow(/not found/);
    const [rule] = await mod.addAccessRule(input);
    rule.expiresAt = new Date(0).toISOString();
    await expect(mod.updateAccessRule(rule.id, true)).rejects.toThrow(/expired/);
  });

  test("expired entries are pruned when adding, and the active rule count is bounded", async () => {
    const mod = await load();
    const [rule] = await mod.addAccessRule(input);
    settings["security.accessRules"] = Array.from({ length: 100 }, (_, i) => ({ ...rule, id: String(i) }));
    await expect(mod.addAccessRule(input)).rejects.toThrow(/100/);
    settings["security.accessRules"] = [{ ...rule, expiresAt: new Date(0).toISOString() }];
    expect(await mod.addAccessRule(input)).toHaveLength(1);
  });

  test("cannot change rules on an unmanaged deployment", async () => {
    await expect((await load(UNSET)).addAccessRule(input)).rejects.toThrow(/No reverse proxy/);
    expect(settings).toEqual({});
  });
});

describe("setAnubisProtectionEnabled", () => {
  test("the bundled stack uses the shared socket without a network admin port", async () => {
    vi.stubEnv("CADDY_ADMIN_SOCKET", "/run/caddy-admin/admin.sock");
    vi.mocked(postUnix).mockResolvedValue(new Response(""));
    const mod = await load(UNSET);
    expect(mod.anubisManaged()).toBe(true);
    await mod.setAnubisProtectionEnabled(true);
    expect(postUnix).toHaveBeenCalledExactlyOnceWith(
      "/run/caddy-admin/admin.sock",
      "/load",
      routeThroughAnubis(CADDYFILE),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(settings["security.anubisProtection"]).toBe(true);
  });
  test("enabling loads the Anubis-routed Caddyfile, then persists", async () => {
    const mod = await load();
    await mod.setAnubisProtectionEnabled(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://caddy:2019/load");
    expect(init!.method).toBe("POST");
    expect(new Headers(init!.headers).get("content-type")).toBe("text/caddyfile");
    expect(init!.body).toBe(routeThroughAnubis(CADDYFILE));
    expect(settings["security.anubisProtection"]).toBe(true);
  });

  test("disabling loads the operator's Caddyfile unchanged", async () => {
    const mod = await load();
    await mod.setAnubisProtectionEnabled(false);
    expect(fetchMock.mock.calls[0][1]!.body).toBe(CADDYFILE);
    expect(settings["security.anubisProtection"]).toBe(false);
  });

  test("a rejected config is reported and nothing is persisted", async () => {
    fetchMock.mockResolvedValue(new Response("  adapting config: bad directive ", { status: 400 }));
    const mod = await load();
    await expect(mod.setAnubisProtectionEnabled(true)).rejects.toThrow(
      "Caddy rejected the config: adapting config: bad directive.",
    );
    expect(settings).toEqual({});
  });

  test("an empty rejection names the status", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 502 }));
    await expect((await load()).setAnubisProtectionEnabled(true)).rejects.toThrow("(HTTP 502)");
  });

  test("without a managed proxy the toggle refuses", async () => {
    const mod = await load(UNSET);
    await expect(mod.setAnubisProtectionEnabled(true)).rejects.toThrow(
      "No reverse proxy is under management in this environment.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(settings).toEqual({});
  });
});

describe("reconcileAnubisInBackground", () => {
  beforeEach(() => {
    vi.mocked(readFile).mockResolvedValue(CADDYFILE);
  });

  test("does nothing without a managed proxy", async () => {
    (await load(UNSET)).reconcileAnubisInBackground();
    await vi.waitFor(() => expect(settingsRepo.get).not.toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("re-applies the stored state once Caddy answers", async () => {
    settings["security.anubisProtection"] = true;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED")).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    (await load()).reconcileAnubisInBackground();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]!.body).toBe(routeThroughAnubis(CADDYFILE));
  });

  test("restores saved IP rules even with proof-of-work off", async () => {
    const mod = await load();
    const rules = await mod.addAccessRule({ network: "192.0.2.1", action: "block", reason: "", expiresInHours: 24 });
    fetchMock.mockClear();
    vi.useFakeTimers();
    mod.reconcileAnubisInBackground();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe(renderAccessRules(CADDYFILE, rules));
  });

  test("gives up after 60 attempts with a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    (await load()).reconcileAnubisInBackground();
    await vi.advanceTimersByTimeAsync(60 * 2_000);
    expect(fetchMock).toHaveBeenCalledTimes(60);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("after startup retries"));
  });
});
