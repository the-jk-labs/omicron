// SPDX-License-Identifier: AGPL-3.0-or-later
// The universal `+page.ts` loader (the server half has its own test).
import { expect, test } from "vitest";
import { load } from "../../../src/routes/compose/+page";
import { apiError, type Routes } from "../../fakeFetch";
import { post } from "../../fixtures";
import { event, user } from "../event";

const me = user({ id: "author-1" });
const compose = (id: string | null, routes: Routes = {}, who = me) =>
  load(event({ url: `https://blog.example/compose${id ? `?id=${id}` : ""}`, routes, user: who }).event);

test("a guest is sent to sign in", async () => {
  await expect(compose(null, {}, null as never)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a blank composer has no draft", async () => {
  expect(await compose(null)).toEqual({ draft: null });
});

test("an own draft is loaded for editing", async () => {
  const draft = post({ status: "draft" });
  expect(await compose("p1", { "GET /api/posts/p1": { post: draft } })).toEqual({ draft });
});

test("a published post opens in the post editor instead", async () => {
  await expect(compose("p1", { "GET /api/posts/p1": { post: post({ status: "published" }) } })).rejects.toMatchObject({
    status: 302,
    location: `/posts/${post().id}/edit`,
  });
});

test("someone else's draft is forbidden; a missing one is a 404", async () => {
  await expect(
    compose("p1", {
      "GET /api/posts/p1": {
        post: post({ author: { id: "other", username: "x", displayName: "X", avatarUrl: null } }),
      },
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(compose("gone")).rejects.toMatchObject({ status: 404, body: { message: "Draft not found" } });
  await expect(compose("p1", { "*": apiError(500) })).rejects.toMatchObject({ status: 500 });
});
