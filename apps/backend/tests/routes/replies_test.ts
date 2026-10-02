// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, expect, test, vi } from "vitest";

vi.mock(import("@/federation/note.ts"));

import { repliesPayload } from "@/federation/note.ts";
import { repliesRoutes } from "@/routes/replies.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

afterEach(() => {
  seedFederationOrigin("http://localhost:5173");
});

test("serves the Replies collection as ActivityPub JSON from the federation origin", async () => {
  seedFederationOrigin("https://blog.example");
  vi.mocked(repliesPayload).mockResolvedValue({ type: "OrderedCollection" });
  const res = await repliesRoutes.request("/users/ada/posts/p1/replies");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/activity+json");
  expect(await res.json()).toEqual({ type: "OrderedCollection" });
  expect(repliesPayload).toHaveBeenCalledWith("https://blog.example", "ada", "p1");
});

test("an unknown or non-public post is a plain 404", async () => {
  vi.mocked(repliesPayload).mockResolvedValue(null);
  expect((await repliesRoutes.request("/users/ada/posts/p1/replies")).status).toBe(404);
});
