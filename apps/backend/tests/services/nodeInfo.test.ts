// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/comments.ts"));
vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));

import * as commentsRepo from "@/db/repositories/comments.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { nodeInfo, nodeInfo20 } from "@/services/nodeInfo.ts";
import { APP_VERSION } from "@/version.ts";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(settingsRepo.get).mockResolvedValue("My Blog");
  vi.mocked(usersRepo.countUsers).mockResolvedValue(12);
  vi.mocked(usersRepo.countActiveSince).mockImplementation(async (since: Date) =>
    NOW.getTime() - since.getTime() === 30 * DAY ? 4 : 9,
  );
  vi.mocked(postsRepo.countLocalPublished).mockResolvedValue(33);
  vi.mocked(commentsRepo.countAll).mockResolvedValue(70);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nodeInfo (2.1)", () => {
  test("publishes aggregate usage over the 30- and 180-day windows", async () => {
    const info = await nodeInfo();
    expect(info.usage).toEqual({
      users: { total: 12, activeMonth: 4, activeHalfyear: 9 },
      localPosts: 33,
      localComments: 70,
    });
    const windows = vi.mocked(usersRepo.countActiveSince).mock.calls.map(([d]) => (NOW.getTime() - d.getTime()) / DAY);
    expect(windows.toSorted((a, b) => a - b)).toEqual([30, 180]);
  });

  test("identifies the software with a NodeInfo-legal lowercase name", async () => {
    const info = await nodeInfo();
    expect(info.software.name).toBe("omicron");
    expect(info.software.name).toMatch(/^[a-z0-9-]+$/);
    expect(info.software.version).toBe(APP_VERSION);
    expect(String(info.software.repository)).toBe("https://github.com/the-jk-labs/omicron");
    expect(info.protocols).toEqual(["activitypub"]);
    expect(info.services).toEqual({ inbound: [], outbound: ["rss2.0"] });
    expect(info.openRegistrations).toBe(true);
  });

  test("uses the wizard-set instance name as nodeName", async () => {
    expect((await nodeInfo()).metadata).toEqual({ nodeName: "My Blog" });
  });

  test("falls back to PUBLIC_APP_NAME, then to Omicron", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
    vi.stubEnv("PUBLIC_APP_NAME", "  Env Name  ");
    expect((await nodeInfo()).metadata).toEqual({ nodeName: "Env Name" });
    vi.stubEnv("PUBLIC_APP_NAME", undefined);
    expect((await nodeInfo()).metadata).toEqual({ nodeName: "Omicron" });
  });

  test("never leaks anything identifying beyond the instance name", async () => {
    const json = JSON.stringify(await nodeInfo());
    expect(json).not.toMatch(/@|email|username/i);
  });
});

describe("nodeInfo20", () => {
  test("is the same facts in the 2.0 schema, without 2.1-only fields", async () => {
    const info = await nodeInfo20();
    expect(info).toEqual({
      version: "2.0",
      software: { name: "omicron", version: APP_VERSION },
      protocols: ["activitypub"],
      services: { inbound: [], outbound: ["rss2.0"] },
      openRegistrations: true,
      usage: { users: { total: 12, activeMonth: 4, activeHalfyear: 9 }, localPosts: 33, localComments: 70 },
      metadata: { nodeName: "My Blog" },
    });
    expect(info.software).not.toHaveProperty("repository");
  });
});
