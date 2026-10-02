// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { search } from "@/services/openverse.ts";
import { APP_VERSION } from "@/version.ts";

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: "img-1",
  title: "A cat",
  url: "https://live.staticflickr.com/cat.jpg",
  thumbnail: "https://api.openverse.org/v1/images/img-1/thumb/",
  foreign_landing_url: "https://www.flickr.com/photos/x/1",
  creator: "Jane",
  creator_url: "https://www.flickr.com/photos/jane",
  license: "by-sa",
  license_version: "2.0",
  license_url: "https://creativecommons.org/licenses/by-sa/2.0/",
  source: "flickr",
  provider: "flickr",
  ...overrides,
});

let fetchMock: ReturnType<typeof vi.spyOn>;

function respond(results: unknown[], status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ results }), { status }));
}

beforeEach(() => {
  fetchMock = vi.spyOn(globalThis, "fetch");
  respond([]);
});

describe("request", () => {
  test("asks for commercially usable, modifiable raster photos, not mature ones", async () => {
    await search("cats", 2);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://api.openverse.org/v1/images/");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "cats",
      page: "2",
      page_size: "20",
      license_type: "commercial,modification",
      extension: "jpg,jpeg,png",
      mature: "false",
    });
  });

  test("identifies itself and caps the query at 100 characters", async () => {
    await search("x".repeat(500));
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url as string).searchParams.get("q")).toHaveLength(100);
    expect(new Headers(init!.headers).get("user-agent")).toBe(
      `Omicron/${APP_VERSION} (+https://github.com/the-jk-labs/omicron)`,
    );
  });
});

describe("results", () => {
  test("maps a result to a credited stock photo", async () => {
    respond([raw()]);
    expect(await search("cats")).toEqual([
      {
        id: "img-1",
        alt: "A cat",
        thumbUrl: "https://api.openverse.org/v1/images/img-1/thumb/",
        bannerUrl: "https://live.staticflickr.com/cat.jpg",
        credit: {
          name: "Jane",
          nameUrl: "https://www.flickr.com/photos/jane",
          source: "Flickr",
          sourceUrl: "https://www.flickr.com/photos/x/1",
          license: "CC BY-SA 2.0",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/",
        },
        useToken: null,
      },
    ]);
  });

  test.for([
    [{ license: "cc0", license_version: "1.0" }, "CC0 1.0"],
    [{ license: "cc0", license_version: "" }, "CC0"],
    [{ license: "pdm", license_version: "1.0" }, "Public domain"],
    [{ license: "by", license_version: "" }, "CC BY"],
  ] as const)("labels licence %o as %s", async ([overrides, label]) => {
    respond([raw(overrides)]);
    expect((await search("q"))[0].credit.license).toBe(label);
  });

  test("falls back to the full image when there is no thumbnail, and to the provider name", async () => {
    respond([raw({ thumbnail: null, source: "", provider: "wikimedia" })]);
    const [p] = await search("q");
    expect(p.thumbUrl).toBe(p.bannerUrl);
    expect(p.credit.source).toBe("Wikimedia");
  });

  test.for(["id", "url", "creator", "creator_url", "foreign_landing_url", "license", "license_url"])(
    "drops a result missing %s rather than publishing it uncredited",
    async (field) => {
      respond([raw({ [field]: "" }), raw({ id: "ok" })]);
      expect((await search("q")).map((p) => p.id)).toEqual(["ok"]);
    },
  );

  test("drops a result with neither source nor provider", async () => {
    respond([raw({ source: null, provider: undefined })]);
    expect(await search("q")).toEqual([]);
  });

  test("ignores non-string junk fields", async () => {
    respond([raw({ title: 42 })]);
    expect((await search("q"))[0].alt).toBe("");
  });

  test("a body without results (or not JSON) is an empty page", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await search("q")).toEqual([]);
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await search("q")).toEqual([]);
  });

  // BUG: Openverse source keys are snake_case identifiers
  // ("wikimedia_commons", "smithsonian_american_art_museum"); only the first
  // letter is capitalised, so the credit printed under a published banner
  // reads "Wikimedia_commons".
  test.fails("BUG: a multi-word source key reads as words in the credit line", async () => {
    respond([raw({ source: "wikimedia_commons" })]);
    expect((await search("q"))[0].credit.source).not.toContain("_");
  });
});

describe("failures are 400s the editor can print", () => {
  test("rate limited", async () => {
    respond([], 429);
    await expect(search("q")).rejects.toMatchObject({
      status: 400,
      message: "The photo search is busy right now. Try again in a minute.",
    });
  });

  test("server error", async () => {
    respond([], 500);
    await expect(search("q")).rejects.toMatchObject({
      status: 400,
      message: "Photo search failed. Try again in a moment.",
    });
  });

  test("network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(search("q")).rejects.toMatchObject({
      status: 400,
      message: "Couldn't reach the photo search. Try again in a moment.",
    });
  });

  test("a hung request is aborted after eight seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_u: unknown, init?: RequestInit) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))),
        ) as never,
    );
    const pending = search("q").catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await pending).toMatchObject({ status: 400 });
    vi.useRealTimers();
  });
});
