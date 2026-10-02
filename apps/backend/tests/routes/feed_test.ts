// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { postWithAuthor } from "../fixtures.ts";
import { mount } from "./harness.ts";

vi.mock(import("@/services/feed.ts"));
vi.mock(import("@/services/engagement.ts"));

import { feedRoutes } from "@/routes/feed.ts";
import { enrichPosts } from "@/services/engagement.ts";
import { homeFeed } from "@/services/feed.ts";

const api = mount("/api/feed", feedRoutes);

test("the home feed requires a signed-in user", async () => {
  api.signOut();
  expect((await api.request("/api/feed")).status).toBe(401);
});

test("passes the opaque cursor through untouched and enriches for the viewer", async () => {
  api.signIn();
  vi.mocked(homeFeed).mockResolvedValue({ items: [postWithAuthor({ id: "p1" })], nextCursor: "n" });
  vi.mocked(enrichPosts).mockResolvedValue([{ id: "p1" }] as never);
  expect(await (await api.request("/api/feed?cursor=abc%3D")).json()).toEqual({
    items: [{ id: "p1" }],
    nextCursor: "n",
  });
  expect(homeFeed).toHaveBeenCalledWith("me", "abc=");
  expect(enrichPosts).toHaveBeenCalledWith(expect.any(Array), "me");
});

test("no cursor is null", async () => {
  api.signIn();
  vi.mocked(homeFeed).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(enrichPosts).mockResolvedValue([]);
  await api.request("/api/feed");
  expect(homeFeed).toHaveBeenCalledWith("me", null);
});
