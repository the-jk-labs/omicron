// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Context, Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

vi.mock(import("@/auth/auth.ts"));
vi.mock(import("@/db/repositories/oauth.ts"));
vi.mock(import("@/db/repositories/users.ts"));
import * as oauthRepo from "@/db/repositories/oauth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { handleError } from "@/lib/http.ts";
import { clientAccess, clientOperations } from "@/routes/clientAccess.ts";
import { apiRoutes } from "@/routes/index.ts";
import { mayModerate, requireAdmin, sessionMiddleware } from "@/routes/middleware.ts";
import type { AppEnv } from "@/routes/types.ts";

const token = `Bearer omi_at_${"a".repeat(43)}`;
const app = new Hono<AppEnv>().onError(handleError);
app.use("/api/*", sessionMiddleware);
const respond = (c: Context<AppEnv>) => {
  if (c.req.path.startsWith("/api/admin/")) requireAdmin(c);
  return c.json({ id: c.get("user")?.id, mayModerate: mayModerate(c) });
};
app.get("/api/posts/export", respond);
for (const route of apiRoutes.routes) {
  if (route.method !== "ALL") app.on(route.method, `/api${route.path}`.replace(/\/$/, ""), respond);
}
app.all("/api/*", respond);
const identity = (scopes: string, isAdmin = false) => {
  vi.mocked(oauthRepo.findToken).mockResolvedValue({ userId: "user-1", scopes } as never);
  vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ isAdmin }));
};
const request = (path: string, method = "GET") =>
  app.request(`/api${path}`, { method, headers: { authorization: token, cookie: "irrelevant" } });

beforeEach(() => identity("read write"));

test("every registered API operation has an explicit delegation decision", () => {
  const routes = apiRoutes.routes.filter((route) => route.method !== "ALL");
  for (const route of routes) {
    const path = `/api${route.path}`.replace(/\/$/, "");
    expect(
      clientOperations.find((operation) => operation.method === route.method && operation.path === path),
      `${route.method} ${path}`,
    ).toBeDefined();
  }
  for (const operation of clientOperations) {
    expect(
      routes.some(
        (route) => route.method === operation.method && `/api${route.path}`.replace(/\/$/, "") === operation.path,
      ),
      `${operation.method} ${operation.path}`,
    ).toBe(true);
  }
});

test("full ordinary scopes cover existing product features, not setup or admin", async () => {
  for (const [method, path] of [
    ["GET", "/me"],
    ["GET", "/feed"],
    ["GET", "/posts/mine"],
    ["POST", "/posts"],
    ["PATCH", "/posts/p"],
    ["DELETE", "/posts/p"],
    ["POST", "/posts/p/comments"],
    ["GET", "/lists/read-later"],
    ["POST", "/uploads"],
    ["POST", "/photos/use"],
    ["POST", "/remote/users/ada%40example.test/follow"],
    ["POST", "/notifications/read"],
    ["GET", "/dashboard"],
    ["POST", "/reports"],
  ]) {
    expect((await request(path, method)).status, `${method} ${path}`).toBe(200);
  }
  for (const path of ["/admin/settings", "/not-yet-delegated"]) expect((await request(path)).status).toBe(403);
  expect((await request("/setup", "POST")).status).toBe(403);
});

test("read-only and narrow grants cannot write or disclose other private resources", async () => {
  identity("read");
  expect((await request("/posts")).status).toBe(200);
  const denied = await request("/posts", "POST");
  expect(denied.status).toBe(403);
  expect(denied.headers.get("www-authenticate")).toContain('scope="write:posts"');
  identity("read:posts");
  expect((await request("/posts/drafts")).status).toBe(200);
  expect((await request("/me")).status).toBe(403);
  expect((await request("/notifications")).status).toBe(403);
  identity("read:accounts");
  expect((await request("/posts")).status).toBe(403);
});

test("admin scopes require the current role and personal writes do not inherit moderation powers", async () => {
  identity("admin:read");
  expect((await request("/admin/settings")).status).toBe(403);
  identity("admin:read", true);
  expect((await request("/admin/settings")).status).toBe(200);
  expect((await request("/admin/instance", "PUT")).status).toBe(403);
  identity("write:posts", true);
  expect(await (await request("/posts/p", "DELETE")).json()).toMatchObject({ mayModerate: false });
  identity("write:posts admin:write", true);
  expect(await (await request("/posts/p", "DELETE")).json()).toMatchObject({ mayModerate: true });
});

test("revoked, expired, suspended and deleted credentials fail without cookie fallback", async () => {
  vi.mocked(oauthRepo.findToken).mockResolvedValue(undefined);
  const res = await request("/me");
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toContain("invalid_token");
});

test("literal routes win over parameters and HEAD has the same scope as GET", () => {
  expect(clientAccess("GET", "/api/users/me/blocked")?.scope).toBe("read:blocks");
  expect(clientAccess("HEAD", "/api/posts/mine/counts")?.scope).toBe("read:posts");
  expect(clientAccess("GET", "/api/future/private")?.scope).toBeUndefined();
});

test("new literal endpoints cannot inherit access from an existing parameterized route", async () => {
  expect((await request("/posts/export")).status).toBe(403);
  identity("read:follows");
  expect((await request("/tags/following")).status).toBe(200);
  expect((await request("/tags/another-tag")).status).toBe(403);
});
