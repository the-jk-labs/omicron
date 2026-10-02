// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/services/stockPhotos.ts"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    available: vi.fn<typeof mod.available>(),
    search: vi.fn<typeof mod.search>(),
    recordUse: vi.fn<typeof mod.recordUse>(),
  };
});

import { photoRoutes } from "@/routes/photos.ts";
import * as stockPhotos from "@/services/stockPhotos.ts";

const api = mount("/api/photos", photoRoutes);
let user = 0;

beforeEach(() => {
  // A fresh account per test keeps the per-user search limiter apart.
  api.signIn({ id: `u${++user}` });
  vi.mocked(stockPhotos.search).mockResolvedValue([]);
});

test.for([
  ["GET", "/api/photos/providers"],
  ["GET", "/api/photos/search?provider=openverse&q=x"],
])("%s %s requires a signed-in user", async ([method, path]) => {
  api.signOut();
  expect((await api.request(path, { method })).status).toBe(401);
});

test("lists the available providers", async () => {
  vi.mocked(stockPhotos.available).mockResolvedValue(["openverse"]);
  expect(await (await api.request("/api/photos/providers")).json()).toEqual({ providers: ["openverse"] });
});

test("search passes provider, query and page", async () => {
  await api.request("/api/photos/search?provider=unsplash&q=cats&page=3");
  expect(stockPhotos.search).toHaveBeenCalledWith("unsplash", "cats", 3);
});

test("a missing or junk page is page 1; a missing query is empty", async () => {
  await api.request("/api/photos/search?provider=openverse");
  await api.request("/api/photos/search?provider=openverse&page=abc");
  expect(vi.mocked(stockPhotos.search).mock.calls).toEqual([
    ["openverse", "", 1],
    ["openverse", "", 1],
  ]);
});

test("an unknown provider is a 400", async () => {
  expect((await api.request("/api/photos/search?provider=pexels&q=x")).status).toBe(400);
  expect(stockPhotos.search).not.toHaveBeenCalled();
});

test("search is capped at 20 a minute per account", async () => {
  for (let i = 0; i < 20; i++)
    expect((await api.request("/api/photos/search?provider=openverse&q=x")).status).toBe(200);
  expect((await api.request("/api/photos/search?provider=openverse&q=x")).status).toBe(429);
});

test("recording use validates the body and the provider", async () => {
  vi.mocked(stockPhotos.recordUse).mockResolvedValue();
  expect(await (await api.json("/api/photos/use", "POST", { provider: "unsplash", token: "t" })).json()).toEqual({
    ok: true,
  });
  expect(stockPhotos.recordUse).toHaveBeenCalledWith("unsplash", "t");
  expect((await api.json("/api/photos/use", "POST", { provider: "unsplash", token: "" })).status).toBe(400);
  expect((await api.json("/api/photos/use", "POST", { provider: "pexels", token: "t" })).status).toBe(400);
  api.signOut();
  expect((await api.json("/api/photos/use", "POST", { provider: "unsplash", token: "t" })).status).toBe(401);
});
