// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("@/services/oauth.ts"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    register: vi.fn<typeof actual.register>(),
    exchange: vi.fn<typeof actual.exchange>(),
    revoke: vi.fn<typeof actual.revoke>(),
    prepare: vi.fn<typeof actual.prepare>(),
    decide: vi.fn<typeof actual.decide>(),
    verify: vi.fn<typeof actual.verify>(),
    connections: vi.fn<typeof actual.connections>(),
    disconnect: vi.fn<typeof actual.disconnect>(),
    metadata: vi.fn<typeof actual.metadata>(),
  };
});
import { handleError } from "@/lib/http.ts";
import { oauthRoutes } from "@/routes/oauth.ts";
import * as oauth from "@/services/oauth.ts";

const app = new Hono().onError(handleError).route("/", oauthRoutes);
app.get("/api/unrelated", (c) => c.json({ ok: true }, 200, { "cache-control": "public, max-age=3600" }));
let nextIp = 0;
const json = (path: string, value: unknown, headers: Record<string, string> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `192.0.2.${++nextIp}`, ...headers },
    body: JSON.stringify(value),
  });

beforeEach(() => {
  vi.mocked(oauth.register).mockResolvedValue({
    id: "c",
    name: "Directory",
    website: null,
    redirect_uri: "https://client.example/cb",
    redirect_uris: ["https://client.example/cb"],
    scopes: ["read:accounts"],
    token_endpoint_auth_method: "client_secret_basic",
    client_id: "c",
    client_secret: "s",
    vapid_key: "",
  });
});

test("registration accepts JSON and form bodies", async () => {
  expect((await json("/api/v1/apps", { client_name: "Directory" })).status).toBe(200);
  await app.request("/api/v1/apps", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "client_name=Directory&scopes=read%3Aaccounts",
  });
  expect(oauth.register).toHaveBeenLastCalledWith({ client_name: "Directory", scopes: "read:accounts" });
});
test("duplicate parameters are refused, not silently selected", async () => {
  const response = await app.request("/api/v1/apps", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "client_name=first&client_name=second",
  });
  expect(response.status).toBe(400);
  expect(oauth.register).not.toHaveBeenCalled();
  expect((await app.request("/api/oauth/authorize?client_id=one&client_id=two")).status).toBe(400);
  expect(oauth.prepare).not.toHaveBeenCalled();
});
test.for([null, [], 42, "text"])("rejects JSON that is not an object: %o", async (value) => {
  expect((await json("/api/v1/apps", value)).status).toBe(400);
});
test("caps streaming bodies without trusting Content-Length", async () => {
  expect((await json("/api/v1/apps", { client_name: "x".repeat(16_384) })).status).toBe(413);
  expect(oauth.register).not.toHaveBeenCalled();
});
test("supports HTTP Basic client authentication and form bodies", async () => {
  const response = await app.request("/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa("client%2Bid:secret%3Avalue")}`,
    },
    body: "grant_type=authorization_code&code=fixture",
  });
  expect(response.status).toBe(200);
  expect(oauth.exchange).toHaveBeenCalledWith({
    grant_type: "authorization_code",
    code: "fixture",
    client_id: "client+id",
    client_secret: "secret:value",
  });
});
test("rejects mixed client authentication methods", async () => {
  expect(
    (await json("/oauth/token", { client_id: "body" }, { authorization: `Basic ${btoa("header:secret")}` })).status,
  ).toBe(400);
  expect(oauth.exchange).not.toHaveBeenCalled();
});
test("OAuth failures have protocol error codes, no-store, and authentication challenges", async () => {
  vi.mocked(oauth.verify).mockRejectedValue(new oauth.OAuthError("invalid_token", "Invalid token.", 401));
  const response = await app.request("/api/v1/accounts/verify_credentials");
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "invalid_token", error_description: "Invalid token." });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
});
test("the OAuth router never changes cache policy on unrelated API paths", async () => {
  const response = await app.request("/api/unrelated");
  expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
  expect(response.headers.has("pragma")).toBe(false);
});
test("registration is rate-limited per address", async () => {
  const headers = { "x-forwarded-for": "192.0.2.250" };
  for (let i = 0; i < 10; i++) expect((await json("/api/v1/apps", {}, headers)).status).toBe(200);
  const response = await json("/api/v1/apps", {}, headers);
  expect(response.status).toBe(429);
  expect(response.headers.has("retry-after")).toBe(true);
});
