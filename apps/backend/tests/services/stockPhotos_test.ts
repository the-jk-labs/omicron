// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";

vi.mock(import("@/services/openverse.ts"));
vi.mock(import("@/services/unsplash.ts"));

import * as openverse from "@/services/openverse.ts";
import { available, isProvider, recordUse, requireProvider, search } from "@/services/stockPhotos.ts";
import * as unsplash from "@/services/unsplash.ts";

describe("providers", () => {
  test("recognizes exactly the two providers", () => {
    expect(isProvider("openverse")).toBe(true);
    expect(isProvider("unsplash")).toBe(true);
    for (const v of ["Openverse", "pexels", "", null, 1, undefined]) expect(isProvider(v)).toBe(false);
  });

  test("requireProvider rejects anything else with a 400", () => {
    expect(requireProvider("unsplash")).toBe("unsplash");
    expect(() => requireProvider("pexels")).toThrow(expect.objectContaining({ status: 400 }));
  });

  test("Openverse is always available; Unsplash only when configured", async () => {
    vi.mocked(unsplash.configured).mockResolvedValue(false);
    expect(await available()).toEqual(["openverse"]);
    vi.mocked(unsplash.configured).mockResolvedValue(true);
    expect(await available()).toEqual(["openverse", "unsplash"]);
  });
});

describe("search", () => {
  test("a blank query never reaches a provider", async () => {
    expect(await search("openverse", "   ")).toEqual([]);
    expect(openverse.search).not.toHaveBeenCalled();
  });

  test("routes to the chosen provider with a trimmed query", async () => {
    vi.mocked(openverse.search).mockResolvedValue([]);
    vi.mocked(unsplash.search).mockResolvedValue([]);
    await search("openverse", "  cats ");
    expect(openverse.search).toHaveBeenCalledWith("cats", 1);
    await search("unsplash", "dogs", 3);
    expect(unsplash.search).toHaveBeenCalledWith("dogs", 3);
  });

  test.for([
    [0, 1],
    [-5, 1],
    [2.9, 2],
    [20, 20],
    [21, 20],
    [10_000, 20],
    [Number.NaN, 1],
  ])("clamps page %d to %d", async ([page, expected]) => {
    vi.mocked(openverse.search).mockResolvedValue([]);
    await search("openverse", "q", page);
    expect(openverse.search).toHaveBeenCalledWith("q", expected);
  });
});

describe("recordUse", () => {
  test("pings Unsplash's download tracker", async () => {
    await recordUse("unsplash", "token");
    expect(unsplash.trackDownload).toHaveBeenCalledWith("token");
  });

  test("is a no-op for Openverse", async () => {
    await recordUse("openverse", "token");
    expect(unsplash.trackDownload).not.toHaveBeenCalled();
  });
});
