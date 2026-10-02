import { ApiError, makeApi } from "$lib/api/client";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

test("sends JSON to the same-origin /api proxy and parses the reply", async () => {
  const { fetch, calls } = fakeFetch({ "POST /api/things": { id: 1 } });
  expect(await makeApi(fetch).post("/things", { a: 1 })).toEqual({ id: 1 });
  expect(calls[0]).toMatchObject({ method: "POST", path: "/api/things", body: { a: 1 } });
  expect(calls[0].headers.get("content-type")).toBe("application/json");
});

test("each verb maps to its method; a bodiless call sends no body", async () => {
  const { fetch, calls } = fakeFetch({
    "GET /api/x": {},
    "PATCH /api/x": {},
    "PUT /api/x": {},
    "DELETE /api/x": {},
    "POST /api/x": {},
  });
  const api = makeApi(fetch);
  await api.get("/x");
  await api.patch("/x", { b: 2 });
  await api.put("/x", { c: 3 });
  await api.del("/x");
  await api.post("/x");
  expect(calls.map((c) => [c.method, c.body])).toEqual([
    ["GET", undefined],
    ["PATCH", { b: 2 }],
    ["PUT", { c: 3 }],
    ["DELETE", undefined],
    ["POST", undefined],
  ]);
});

test("a raw upload keeps its own content type and bytes", async () => {
  const { fetch, calls } = fakeFetch({ "POST /api/uploads": { url: "/u" } });
  await makeApi(fetch).postRaw("/uploads", new TextEncoder().encode("PNGDATA"), "image/png");
  expect(calls[0].headers.get("content-type")).toBe("image/png");
  expect(calls[0].body).toBe("PNGDATA");
});

test("an empty success body is null", async () => {
  const { fetch } = fakeFetch({ "DELETE /api/x": () => new Response(null, { status: 204 }) });
  expect(await makeApi(fetch).del("/x")).toBe(null);
});

test("an error carries the status and the backend's message, or a generic one", async () => {
  const { fetch } = fakeFetch({
    "GET /api/a": apiError(403, "Forbidden thing"),
    "GET /api/b": () => Response.json({}, { status: 500 }),
  });
  const api = makeApi(fetch);
  await expect(api.get("/a")).rejects.toEqual(new ApiError(403, "Forbidden thing"));
  await expect(api.get("/a")).rejects.toMatchObject({ status: 403 });
  await expect(api.get("/b")).rejects.toMatchObject({ status: 500, message: "Request failed (500)" });
});

// BUG: every non-empty body goes through JSON.parse before the status is
// looked at. An error that does not come from the backend's JSON handler — a
// 502/504 HTML page from Caddy while the backend restarts, a plain-text
// "Payload Too Large" — throws a SyntaxError instead, so callers that branch on
// `err instanceof ApiError` (404 pages, form error messages) show
// "Unexpected token '<'" or crash the load.
test.fails("BUG: a non-JSON error page still surfaces as an ApiError with its status", async () => {
  const { fetch } = fakeFetch({
    "GET /api/x": () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
  });
  await expect(makeApi(fetch).get("/x")).rejects.toMatchObject({ status: 502 });
});
