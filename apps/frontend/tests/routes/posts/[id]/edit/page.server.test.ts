// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../../../src/routes/posts/[id]/edit/+page.server";
import { apiError, type Routes } from "../../../../fakeFetch";
import { post } from "../../../../fixtures";
import { event, user } from "../../../event";

const me = user({ id: "author-1" });
const edit = (routes: Routes, who: ReturnType<typeof user> | null = me) =>
  load(event({ params: { id: "p1" }, routes, user: who }).event);

test("the author edits their own local post", async () => {
  const P = post();
  expect(await edit({ "GET /api/posts/p1": { post: P } })).toEqual({ post: P });
});

test("a guest is sent to sign in", async () => {
  await expect(edit({}, null)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a federated post or someone else's is forbidden", async () => {
  await expect(edit({ "GET /api/posts/p1": { post: post({ remote: true }) } })).rejects.toMatchObject({ status: 403 });
  const other = post({ author: { id: "x", username: "x", displayName: "X", avatarUrl: null } });
  await expect(edit({ "GET /api/posts/p1": { post: other } })).rejects.toMatchObject({
    status: 403,
    body: { message: "You can only edit your own posts." },
  });
});

test("a missing post is a 404; other failures propagate", async () => {
  await expect(edit({})).rejects.toMatchObject({ status: 404 });
  await expect(edit({ "*": apiError(500) })).rejects.toMatchObject({ status: 500 });
});
