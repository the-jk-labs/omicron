import { Hono } from "hono";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { z } from "zod";
import { handleError } from "@/lib/http.ts";
import { jsonBody } from "@/lib/validate.ts";

// A rejected body must come back in the same `{ error: string }` shape as every
// other 400, because the frontend client reads `body.error` and shows nothing
// useful otherwise (apps/frontend/src/lib/api/client.ts). These tests pin that
// contract, not just the status code.
function appWith(schema: z.ZodType, message?: string) {
  const app = new Hono();
  app.onError(handleError);
  app.post("/", jsonBody(schema, message), (c) => c.json({ got: c.req.valid("json") }));
  return app;
}

function post(app: Hono, body: string) {
  return app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const schema = z.object({ name: z.string(), count: z.number().optional() });

test("jsonBody: a valid body reaches the handler parsed", async () => {
  const res = await post(appWith(schema), JSON.stringify({ name: "ada", count: 2 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ got: { name: "ada", count: 2 } });
});

test("jsonBody: a wrong-typed field is a 400, not a 500", async () => {
  // The exact case the old code could not catch: `name` is a number, the
  // service calls .trim() on it, and an unhandled TypeError becomes a 500.
  const res = await post(appWith(schema), JSON.stringify({ name: 123 }));
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(typeof body.error).toBe("string");
  // Names the offending field so the message is actionable.
  expect(body.error.startsWith("name:")).toBe(true);
});

test("jsonBody: a missing required field is a 400", async () => {
  const res = await post(appWith(schema), JSON.stringify({ count: 1 }));
  expect(res.status).toBe(400);
  expect(typeof (await res.json()).error).toBe("string");
});

test("jsonBody: malformed JSON is a 400, never a 500", async () => {
  const res = await post(appWith(schema), "{not json");
  expect(res.status).toBe(400);
  expect(typeof (await res.json()).error).toBe("string");
});

test("jsonBody: a body that is not an object is a 400", async () => {
  const res = await post(appWith(schema), JSON.stringify("just a string"));
  expect(res.status).toBe(400);
  expect(typeof (await res.json()).error).toBe("string");
});

test("jsonBody: the message override replaces the derived text", async () => {
  // What the admin endpoints rely on to keep their existing wording.
  const res = await post(appWith(schema, "Expected { name: string }."), JSON.stringify({}));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("Expected { name: string }.");
});

test("jsonBody: a schema with .catch() tolerates a bad body", async () => {
  // How /admin/reports/:id/resolve keeps answering 200 with an empty note
  // rather than 400ing a moderator mid-action.
  const tolerant = z.object({ resolution: z.string().optional() }).catch({});
  const res = await post(appWith(tolerant), JSON.stringify({ resolution: 42 }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ got: {} });
});
