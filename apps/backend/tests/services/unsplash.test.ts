// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/instanceSettings.ts"));

import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { accessKey, configured, search, setAccessKey, trackDownload, withUtm } from "@/services/unsplash.ts";

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: "abc",
  alt_description: "a mountain",
  description: "Long description",
  urls: { small: "https://images.unsplash.com/small", regular: "https://images.unsplash.com/regular" },
  links: { download_location: "https://api.unsplash.com/photos/abc/download?ixid=1" },
  user: { name: "Ann", username: "ann", links: { html: "https://unsplash.com/@ann" } },
  ...overrides,
});

let settings: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.spyOn>;

function respond(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  settings = { "media.unsplashAccessKey": " access-key " };
  vi.mocked(settingsRepo.get).mockImplementation(async (key: string) => settings[key]);
  vi.mocked(settingsRepo.set).mockImplementation(async (key: string, value: unknown) => {
    settings[key] = value;
  });
  fetchMock = vi.spyOn(globalThis, "fetch");
  respond({ results: [] });
});

describe("configuration", () => {
  test("the stored key is trimmed; blank means not configured", async () => {
    expect(await accessKey()).toBe("access-key");
    expect(await configured()).toBe(true);
    settings["media.unsplashAccessKey"] = "   ";
    expect(await accessKey()).toBe(null);
    expect(await configured()).toBe(false);
  });

  test("clearing stores an empty string (the column is NOT NULL)", async () => {
    await setAccessKey(null);
    expect(settings["media.unsplashAccessKey"]).toBe("");
    await setAccessKey("  new  ");
    expect(settings["media.unsplashAccessKey"]).toBe("new");
  });
});

test("withUtm appends the referral tag with the right separator", () => {
  expect(withUtm("https://unsplash.com/@ann")).toBe("https://unsplash.com/@ann?utm_source=omicron&utm_medium=referral");
  expect(withUtm("https://x.test/?a=1")).toBe("https://x.test/?a=1&utm_source=omicron&utm_medium=referral");
});

describe("search", () => {
  test("refuses when no key is configured, without calling Unsplash", async () => {
    settings = {};
    await expect(search("q")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("sends the key server-side with the pinned API version", async () => {
    await search("mountains", 3);
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe("https://api.unsplash.com/search/photos");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: "mountains",
      page: "3",
      per_page: "24",
      content_filter: "high",
      orientation: "landscape",
    });
    const h = new Headers(init!.headers);
    expect(h.get("authorization")).toBe("Client-ID access-key");
    expect(h.get("accept-version")).toBe("v1");
  });

  test("maps a result with UTM-tagged credits and the download token", async () => {
    respond({ results: [raw()] });
    expect(await search("q")).toEqual([
      {
        id: "abc",
        alt: "a mountain",
        thumbUrl: "https://images.unsplash.com/small",
        bannerUrl: "https://images.unsplash.com/regular",
        credit: {
          name: "Ann",
          nameUrl: "https://unsplash.com/@ann?utm_source=omicron&utm_medium=referral",
          source: "Unsplash",
          sourceUrl: "https://unsplash.com/photos/abc?utm_source=omicron&utm_medium=referral",
        },
        useToken: "https://api.unsplash.com/photos/abc/download?ixid=1",
      },
    ]);
  });

  test("falls back to the description, the username, and an empty alt", async () => {
    respond({
      results: [raw({ alt_description: null, user: { username: "ann", links: { html: "https://u/@ann" } } })],
    });
    const [p] = await search("q");
    expect(p.alt).toBe("Long description");
    expect(p.credit.name).toBe("ann");
    respond({ results: [raw({ alt_description: null, description: null })] });
    expect((await search("q"))[0].alt).toBe("");
  });

  test.for([
    { id: "" },
    { urls: { small: "s" } },
    { urls: { regular: "r" } },
    { links: {} },
    { user: { links: { html: "x" } } },
    { user: { name: "Ann" } },
  ])("drops an incomplete result %o", async (overrides) => {
    respond({ results: [raw(overrides), raw({ id: "ok" })] });
    expect((await search("q")).map((p) => p.id)).toEqual(["ok"]);
  });

  test.for([
    [401, "Unsplash rejected this instance's access key."],
    [403, "This instance has hit its Unsplash rate limit. Try again later."],
    [500, "Unsplash search failed. Try again in a moment."],
  ] as const)("a %i is a 400 explaining why", async ([status, message]) => {
    respond({}, status);
    await expect(search("q")).rejects.toMatchObject({ status: 400, message });
  });

  test("a network failure is a 400", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(search("q")).rejects.toMatchObject({ status: 400 });
  });

  test("a body that is not JSON is an empty page", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 200 }));
    expect(await search("q")).toEqual([]);
  });
});

describe("trackDownload", () => {
  test("pings Unsplash's own download endpoint with the key", async () => {
    await trackDownload("https://api.unsplash.com/photos/abc/download?ixid=1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.unsplash.com/photos/abc/download?ixid=1");
    expect(new Headers(init!.headers).get("authorization")).toBe("Client-ID access-key");
  });

  test.for([
    "https://evil.example/steal",
    "http://api.unsplash.com/photos/abc/download",
    "https://api.unsplash.com.evil.example/x",
    "https://user@api.unsplash.com:8443/x",
    "not a url",
    "file:///etc/passwd",
  ])("never forwards the key anywhere else: %s", async (url) => {
    await expect(trackDownload(url)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("is a no-op without a key", async () => {
    settings = {};
    await trackDownload("https://evil.example/x");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an unreachable Unsplash never fails the caller", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(trackDownload("https://api.unsplash.com/photos/abc/download")).resolves.toBeUndefined();
  });
});
