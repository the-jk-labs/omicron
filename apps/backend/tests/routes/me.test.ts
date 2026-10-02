// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";
import { mount } from "./harness.ts";

vi.mock(import("@/db/repositories/tags.ts"));
vi.mock(import("@/services/users.ts"));

import * as tagsRepo from "@/db/repositories/tags.ts";
import { meRoutes } from "@/routes/me.ts";
import * as usersService from "@/services/users.ts";

const api = mount("/api/me", meRoutes);

test("signed out is a 200 with a null user, not a 401", async () => {
  api.signOut();
  const res = await api.request("/api/me");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ user: null });
});

test("signed in returns the private self view with tags and links", async () => {
  api.signIn({ email: "me@example.test", emailVerified: false, passwordHash: "secret-hash" });
  vi.mocked(tagsRepo.tagsForUser).mockResolvedValue([{ slug: "deno", name: "Deno" }]);
  vi.mocked(usersService.profileLinks).mockResolvedValue([
    { id: "l1", userId: "me", platform: "github", url: "https://github.com/me", label: "", position: 0 } as never,
  ]);
  const { user } = await (await api.request("/api/me")).json();
  expect(user).toMatchObject({
    id: "me",
    email: "me@example.test",
    emailVerified: false,
    tags: [{ slug: "deno", name: "Deno" }],
    links: [{ platform: "github", url: "https://github.com/me", label: "" }],
  });
  expect(user).not.toHaveProperty("passwordHash");
  expect(user).not.toHaveProperty("actorKeyPair");
});
