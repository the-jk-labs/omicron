// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
vi.mock(import("@/db/repositories/instanceSettings.ts"));
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import * as umami from "@/services/umami.ts";

const ID = "94db1cb1-74f4-4a40-ad6c-962362670409";
const body = (overrides: Record<string, unknown> = {}) => ({
  type: "event",
  payload: {
    website: ID,
    hostname: "blog.example",
    screen: "1920x1080",
    language: "en",
    title: "Article",
    url: "/@ada/article",
    referrer: "",
    ...overrides,
  },
});

beforeEach(() => {
  vi.mocked(settingsRepo.get).mockResolvedValue(undefined);
});

describe("settings", () => {
  test("fresh and corrupt configuration fail closed", async () => {
    expect(await umami.getSettings()).toEqual({ enabled: false, websiteId: "" });
    expect(await umami.websiteId()).toBeNull();
    vi.mocked(settingsRepo.get).mockResolvedValue({ enabled: true, websiteId: "not-a-uuid" });
    expect(await umami.websiteId()).toBeNull();
  });

  test.for([
    ID,
    ` ${ID.toUpperCase()} `,
    `<script defer src="https://cloud.umami.is/script.js" data-website-id="${ID}"></script>`,
    `<script data-website-id='${ID}' src='https://untrusted.example/x.js' onclick='alert(1)'></script>`,
  ])("stores only the normalized website ID from %s", async (websiteId) => {
    expect(await umami.setSettings({ enabled: true, websiteId })).toEqual({ enabled: true, websiteId: ID });
    expect(settingsRepo.set).toHaveBeenCalledExactlyOnceWith("analytics.umami", { enabled: true, websiteId: ID });
  });

  test.for([
    "",
    "invalid",
    "<script>alert(1)</script>",
    `<script data-website-id="${ID}" data-website-id="${ID}"></script>`,
  ])("refuses invalid enabled configuration %s without writing", async (websiteId) => {
    await expect(umami.setSettings({ enabled: true, websiteId })).rejects.toMatchObject({ status: 400 });
    expect(settingsRepo.set).not.toHaveBeenCalled();
  });

  test("disabling retains the ID; clearing removes it", async () => {
    vi.mocked(settingsRepo.get).mockResolvedValue({ enabled: false, websiteId: ID });
    expect(await umami.websiteId()).toBeNull();
    expect(await umami.setSettings({ enabled: false, websiteId: ID })).toEqual({ enabled: false, websiteId: ID });
    expect(await umami.setSettings({ enabled: false, websiteId: "" })).toEqual({ enabled: false, websiteId: "" });
    vi.mocked(settingsRepo.get).mockResolvedValue({ enabled: true, websiteId: ID });
    expect(await umami.websiteId()).toBe(ID);
  });
});

describe("pageview minimization", () => {
  test("removes queries and fragments and minimizes external referrers", () => {
    expect(umami.pageview(body(), ID).payload.referrer).toBe("");
    expect(
      umami.pageview(
        body({
          url: "https://blog.example/@ada/article?token=secret#fragment",
          referrer: "https://search.example/find?q=secret#fragment",
        }),
        ID,
      ).payload,
    ).toMatchObject({ url: "/@ada/article", referrer: "https://search.example" });
    expect(umami.pageview(body({ referrer: "https://blog.example/admin?secret=1" }), ID).payload.referrer).toBe("");
    expect(umami.pageview(body({ referrer: "/tags/writing?private=1" }), ID).payload.referrer).toBe("/tags/writing");
  });

  test.for([
    "/admin",
    "/login",
    "/oauth/authorize",
    "/compose",
    "/posts/123/edit",
    "/search?q=private",
    "/lists/private",
    "https://other.example/@ada/article",
    "javascript:alert(1)",
  ])("rejects non-public or foreign URL %s", (url) => {
    expect(() => umami.pageview(body({ url }), ID)).toThrow("Invalid pageview URL.");
  });

  test.for([
    { website: "00000000-0000-4000-8000-000000000000" },
    { id: "account-id" },
    { name: "custom-event", data: { email: "a@b.test" } },
  ])("refuses a different website, account IDs and custom events: %o", (overrides) => {
    expect(() => umami.pageview(body(overrides), ID)).toThrow("Invalid pageview.");
  });

  test("forwards only required Cloud headers, including modern session cache", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ cache: "next-cache" }));
    const pageview = umami.pageview(body(), ID);
    expect(await umami.sendPageview(pageview, { ip: "192.0.2.1", userAgent: "Test browser", cache: "cache" })).toEqual({
      cache: "next-cache",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gateway.umami.is/api/send");
    expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
      "content-type": "application/json",
      "user-agent": "Test browser",
      "x-forwarded-for": "192.0.2.1",
      "x-umami-website-id": ID,
      "x-umami-hostname": "blog.example",
      "x-umami-cache": "cache",
    });
    expect(JSON.parse(init?.body as string)).toEqual(pageview);
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test("upstream errors are not treated as successful collection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(umami.sendPageview(umami.pageview(body(), ID), { ip: "unknown", userAgent: "" })).rejects.toThrow(
      "Umami collection unavailable.",
    );
  });
});

test("the fixed Cloud tracker is cached and concurrent misses share one fetch", async () => {
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () => new Response("/* tracker */", { headers: { "content-type": "application/javascript" } }),
    );
  expect(await Promise.all([umami.trackerScript(), umami.trackerScript()])).toEqual(["/* tracker */", "/* tracker */"]);
  expect(await umami.trackerScript()).toBe("/* tracker */");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("https://cloud.umami.is/script.js");
  vi.mocked(Date.now).mockReturnValue(3_602_000);
  fetchMock.mockResolvedValueOnce(new Response("<html>error</html>", { headers: { "content-type": "text/html" } }));
  await expect(umami.trackerScript()).rejects.toThrow("Umami tracker unavailable.");
  expect(await umami.trackerScript()).toBe("/* tracker */");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
