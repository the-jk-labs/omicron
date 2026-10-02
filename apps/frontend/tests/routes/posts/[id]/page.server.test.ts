// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../../src/routes/posts/[id]/+page.server";
import { apiError } from "../../../fakeFetch";
import { post } from "../../../fixtures";
import { event } from "../../event";

test("an id link moves permanently to the post's canonical path", async () => {
  await expect(
    load(event({ params: { id: "p1" }, routes: { "GET /api/posts/p1": { post: post() } } }).event),
  ).rejects.toMatchObject({ status: 308, location: "/@ada/hello-world" });
});

test("a missing post is a 404; other failures propagate", async () => {
  await expect(load(event({ params: { id: "p1" } }).event)).rejects.toMatchObject({ status: 404 });
  await expect(load(event({ params: { id: "p1" }, routes: { "*": apiError(500) } }).event)).rejects.toMatchObject({
    status: 500,
  });
});
