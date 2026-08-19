// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { z } from "zod";
import { jsonBody } from "@/lib/validate.ts";
import { handleError } from "@/lib/http.ts";

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

Deno.test("jsonBody: a valid body reaches the handler parsed", async () => {
  const res = await post(appWith(schema), JSON.stringify({ name: "ada", count: 2 }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { got: { name: "ada", count: 2 } });
});

Deno.test("jsonBody: a wrong-typed field is a 400, not a 500", async () => {
  // The exact case the old code could not catch: `name` is a number, the
  // service calls .trim() on it, and an unhandled TypeError becomes a 500.
  const res = await post(appWith(schema), JSON.stringify({ name: 123 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
  // Names the offending field so the message is actionable.
  assertEquals(body.error.startsWith("name:"), true);
});

Deno.test("jsonBody: a missing required field is a 400", async () => {
  const res = await post(appWith(schema), JSON.stringify({ count: 1 }));
  assertEquals(res.status, 400);
  assertEquals(typeof (await res.json()).error, "string");
});

Deno.test("jsonBody: malformed JSON is a 400, never a 500", async () => {
  const res = await post(appWith(schema), "{not json");
  assertEquals(res.status, 400);
  assertEquals(typeof (await res.json()).error, "string");
});

Deno.test("jsonBody: a body that is not an object is a 400", async () => {
  const res = await post(appWith(schema), JSON.stringify("just a string"));
  assertEquals(res.status, 400);
  assertEquals(typeof (await res.json()).error, "string");
});

Deno.test("jsonBody: the message override replaces the derived text", async () => {
  // What the admin endpoints rely on to keep their existing wording.
  const res = await post(appWith(schema, "Expected { name: string }."), JSON.stringify({}));
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, "Expected { name: string }.");
});

Deno.test("jsonBody: a schema with .catch() tolerates a bad body", async () => {
  // How /admin/reports/:id/resolve keeps answering 200 with an empty note
  // rather than 400ing a moderator mid-action.
  const tolerant = z.object({ resolution: z.string().optional() }).catch({});
  const res = await post(appWith(tolerant), JSON.stringify({ resolution: 42 }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { got: {} });
});
