// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { GET } from "../../../src/routes/indexnow-[key].txt/+server";
import { apiError } from "../../fakeFetch";
import { event } from "../event";

test("the instance's own key is served as plain text", async () => {
  const res = await GET(
    event({ params: { key: "abc123" }, routes: { "GET /api/seo/indexnow-key/abc123": { ok: true } } }).event,
  );
  expect(await res.text()).toBe("abc123\n");
  expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
});

test("any other key, or an unreachable backend, is a 404", async () => {
  await expect(
    GET(event({ params: { key: "guess" }, routes: { "GET /api/seo/indexnow-key/guess": { ok: false } } }).event),
  ).rejects.toMatchObject({ status: 404 });
  await expect(GET(event({ params: { key: "x" }, routes: { "*": apiError(500) } }).event)).rejects.toMatchObject({
    status: 404,
  });
});
