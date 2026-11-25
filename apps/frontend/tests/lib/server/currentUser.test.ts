// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { currentUser } from "../../../src/lib/server/currentUser";
import { apiError, fakeFetch } from "../../fakeFetch";

test("the layout and a page share one /api/me per request", async () => {
  const { fetch, calls } = fakeFetch({ "GET /api/me": { user: { id: "u1", username: "ada" } } });
  const locals = {};
  const [a, b] = await Promise.all([currentUser({ locals, fetch }), currentUser({ locals, fetch })]);
  expect(a).toEqual({ id: "u1", username: "ada" });
  expect(b).toBe(a);
  expect(calls).toHaveLength(1);
});

test("each request asks again", async () => {
  const { fetch, calls } = fakeFetch({ "GET /api/me": { user: null } });
  await currentUser({ locals: {}, fetch });
  await currentUser({ locals: {}, fetch });
  expect(calls).toHaveLength(2);
});

test("a failed lookup reads as signed out", async () => {
  const { fetch } = fakeFetch({ "GET /api/me": apiError(502) });
  expect(await currentUser({ locals: {}, fetch })).toBe(null);
});
