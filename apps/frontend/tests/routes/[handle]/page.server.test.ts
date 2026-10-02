// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/[handle]/+page.server";
import { apiError } from "../../fakeFetch";
import { event } from "../event";

const page = { items: [], nextCursor: null };

test("a local profile loads its posts, lists and recommendations together", async () => {
  const data = await load(
    event({
      params: { handle: "@ada" },
      routes: {
        "GET /api/users/ada": { user: { username: "ada" } },
        "GET /api/users/ada/posts": page,
        "GET /api/lists/user/ada": { lists: [{ id: "l1" }] },
        "GET /api/users/ada/recommendations": page,
      },
    }).event,
  );
  expect(data).toEqual({
    remote: false,
    profile: { user: { username: "ada" } },
    page,
    lists: [{ id: "l1" }],
    recommendations: page,
  });
});

test("a user@host handle is a remote profile", async () => {
  const data = await load(
    event({
      params: { handle: "@bob@remote.example" },
      routes: {
        "GET /api/remote/users/bob%40remote.example": { handle: "bob@remote.example" },
        "GET /api/remote/users/bob%40remote.example/posts": page,
        "GET /api/remote/users/bob%40remote.example/recommendations": page,
      },
    }).event,
  );
  expect(data).toMatchObject({ remote: true, profile: { handle: "bob@remote.example" } });
});

test.for(["ada", "@", "x@ada"])("a path without a leading @ handle (%s) is not a profile", async (handle) => {
  await expect(load(event({ params: { handle } }).event)).rejects.toMatchObject({ status: 404 });
});

test("an unknown user is a 404; other failures propagate", async () => {
  await expect(load(event({ params: { handle: "@ghost" } }).event)).rejects.toMatchObject({
    status: 404,
    body: { message: "User not found" },
  });
  const failing = event({ params: { handle: "@ada" }, routes: { "*": apiError(500, "boom") } });
  await expect(load(failing.event)).rejects.toMatchObject({ status: 500, message: "boom" });
});
