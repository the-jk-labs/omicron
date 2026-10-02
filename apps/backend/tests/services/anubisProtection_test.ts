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

import { readFile } from "node:fs/promises";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { routeThroughAnubis } from "@/lib/caddyfile.ts";

const CADDYFILE = `{$APP_DOMAIN} {
\treverse_proxy /api/* backend:8000
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

describe("setAnubisProtectionEnabled", () => {
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
