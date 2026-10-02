// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, remotePostWithAuthor, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/posts.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/instanceSettings.ts"));

import { config } from "@/config.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { keyLocation, postPath, submitPost } from "@/services/indexNow.ts";

const KEY = "0123456789abcdef0123456789abcdef";
const originalDomain = config.APP_DOMAIN;
let settings: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  config.APP_DOMAIN = "blog.example";
  settings = { "seo.indexNowEnabled": true, "seo.indexNowKey": KEY };
  vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => settings[key]);
  vi.mocked(postsRepo.findById).mockResolvedValue(postWithAuthor({ id: "p1", slug: "hello" }, { id: "a" }));
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "a", username: "ada" }));
  fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 202 }));
});

afterEach(() => {
  config.APP_DOMAIN = originalDomain;
});

describe("postPath / keyLocation", () => {
  test("uses the slug, or the short id for a post without one", () => {
    expect(postPath({ id: "9e962281-aaaa", title: "Hi", slug: "hi" }, "ada")).toBe("/@ada/hi");
    expect(postPath({ id: "9e962281-aaaa", title: null, slug: null }, "ada")).toBe("/@ada/9e962281");
  });

  test("the key file lives at the site root", () => {
    expect(keyLocation("https://blog.example", KEY)).toBe(`https://blog.example/indexnow-${KEY}.txt`);
  });
});

describe("submitPost", () => {
  test("submits the canonical URL with the key and its location", async () => {
    await submitPost("p1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.indexnow.org/IndexNow");
    expect(JSON.parse(init!.body as string)).toEqual({
      host: "blog.example",
      key: KEY,
      keyLocation: `https://blog.example/indexnow-${KEY}.txt`,
      urlList: ["https://blog.example/@ada/hello"],
    });
  });

  test.for([
    ["IndexNow is off", { "seo.indexNowEnabled": false, "seo.indexNowKey": KEY }],
    ["indexing is off", { "seo.indexNowEnabled": true, "seo.indexingEnabled": false, "seo.indexNowKey": KEY }],
    ["there is no key", { "seo.indexNowEnabled": true }],
  ])("does nothing when %s", async ([, s]) => {
    settings = s as Record<string, unknown>;
    await submitPost("p1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("does nothing on a localhost instance", async () => {
    config.APP_DOMAIN = "localhost:5173";
    await submitPost("p1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(postsRepo.findById).not.toHaveBeenCalled();
  });

  test.for([
    ["a missing post", null],
    ["a draft", postWithAuthor({ status: "draft" })],
    ["a scheduled post", postWithAuthor({ status: "scheduled" })],
    ["a remote post", remotePostWithAuthor()],
  ])("never submits %s", async ([, row]) => {
    vi.mocked(postsRepo.findById).mockResolvedValue(row as never);
    await submitPost("p1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.for([
    ["suspended", { suspendedAt: new Date() }],
    ["deleted", { deletedAt: new Date() }],
    ["private", { isPrivate: true }],
  ])("never submits a post by a %s author", async ([, u]) => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "a", ...(u as object) }));
    await submitPost("p1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a rejection is logged, never thrown", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(submitPost("p1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("rejected (403)"));
  });

  test("a network failure is logged, never thrown", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(submitPost("p1")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ECONNRESET"));
  });

  test("a hung endpoint is aborted after five seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))),
        ) as never,
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pending = submitPost("p1");
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  test("submits on an instance whose domain was set in the setup wizard", async () => {
    config.APP_DOMAIN = "localhost:5173";
    settings["instance.appDomain"] = "blog.example";
    await submitPost("p1");
    expect(fetchMock).toHaveBeenCalled();
  });
});
