// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

const { getSession } = vi.hoisted(() => ({
  getSession:
    vi.fn<
      (input: {
        headers: Headers;
        query: { disableCookieCache: boolean };
      }) => Promise<{ user: { id: string }; session: { id: string } } | null>
    >(),
}));
vi.mock("@/auth/auth.ts", () => ({ auth: { api: { getSession } } }));
vi.mock(import("@/db/repositories/oauth.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/services/instanceSetup.ts"));

import * as repo from "@/db/repositories/oauth.ts";
import * as users from "@/db/repositories/users.ts";
import { hashToken } from "@/lib/tokens.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import * as oauth from "@/services/oauth.ts";

const origin = "https://omicron.example";
const callback = "https://client.example/callback?existing=1";
const client = "client-id";
const secret = "client-secret";
const headers = () => new Headers({ cookie: "session=fixture", origin });
const request = () => ({
  client_id: client,
  redirect_uri: callback,
  response_type: "code",
  scope: "read:accounts",
  state: "a+/=?&b",
});
const exchange = () => ({
  client_id: client,
  client_secret: secret,
  redirect_uri: callback,
  grant_type: "authorization_code",
  code: "fixture-code",
});
const app = async () => ({
  id: client,
  name: "Directory",
  secretHash: await hashToken(secret),
  redirectUris: [callback],
  scopes: "read:accounts",
  publicClient: false,
  website: null,
  authorizedAt: null,
  createdAt: new Date(),
});
const code = () => ({
  codeHash: "hash",
  clientId: client,
  redirectUri: callback,
  userId: "user-1",
  codeChallenge: null as string | null,
  scopes: "read:accounts",
  expiresAt: new Date(Date.now() + 60_000),
});

beforeEach(async () => {
  vi.mocked(getOrigin).mockResolvedValue(origin);
  vi.mocked(repo.findApp).mockResolvedValue(await app());
  vi.mocked(users.findById).mockResolvedValue(userRow());
  getSession.mockResolvedValue({ user: { id: "user-1" }, session: { id: "session-1" } });
  vi.mocked(repo.findCode).mockResolvedValue(code());
  vi.mocked(repo.exchange).mockResolvedValue(true);
});

describe("registration", () => {
  const registration = () => ({ client_name: "Directory", redirect_uris: callback, scopes: "read:accounts" });
  test("returns independent opaque credentials, storing only a hash", async () => {
    const result = await oauth.register(registration());
    expect(result.client_id).toMatch(/^[\w-]{43}$/);
    expect(result.client_secret).toMatch(/^[\w-]{43}$/);
    expect(result.client_id).not.toBe(result.client_secret);
    expect(repo.createApp).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.client_id,
        secretHash: await hashToken(result.client_secret!),
        redirectUris: [callback],
      }),
    );
    expect(JSON.stringify(vi.mocked(repo.createApp).mock.calls)).not.toContain(result.client_secret);
  });
  test.for(["", "push", "unknown", "read:accounts read:accounts"])("rejects unsupported scopes %o", async (scopes) => {
    await expect(oauth.register({ ...registration(), scopes })).rejects.toMatchObject({ error: "invalid_scope" });
    expect(repo.createApp).not.toHaveBeenCalled();
  });
  test.for([
    "http://remote.example/cb",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://user:pass@client.example/cb",
    "https://client.example/cb#fragment",
    "https://client.example/cb#",
    "https://client.example/cb?code=old",
    "https://client.example/cb?state=x",
    "urn:ietf:wg:oauth:2.0:oob",
  ])("rejects unsafe callback %s", async (redirect_uris) => {
    await expect(oauth.register({ ...registration(), redirect_uris })).rejects.toMatchObject({
      error: "invalid_request",
    });
  });
  test.for(["http://localhost:1234/cb", "http://127.0.0.1:1234/cb", "http://[::1]:1234/cb"])(
    "allows loopback development %s",
    async (redirect_uris) => {
      await expect(oauth.register({ ...registration(), redirect_uris })).resolves.toBeDefined();
    },
  );
  test("supports multiple exact callbacks and deduplicates them", async () => {
    await oauth.register({
      ...registration(),
      redirect_uris: `${callback}\nhttps://client.example/other\n${callback}`,
    });
    expect(repo.createApp).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUris: [callback, "https://client.example/other"] }),
    );
  });
  test("rejects overlong names and too many callbacks", async () => {
    await expect(oauth.register({ ...registration(), client_name: "x".repeat(101) })).rejects.toMatchObject({
      error: "invalid_request",
    });
    await expect(
      oauth.register({ ...registration(), redirect_uris: Array(11).fill(callback).join(" ") }),
    ).rejects.toMatchObject({ error: "invalid_request" });
  });
});

describe("consent", () => {
  test("binds a hashed consent ticket to a live cookie session and exact request", async () => {
    const result = await oauth.prepare(
      request(),
      new Headers({ cookie: "session=fixture", authorization: "Bearer ignored" }),
    );
    expect(result).toMatchObject({
      name: "Directory",
      username: "ada",
      callbackOrigin: "https://client.example",
      scope: "read:accounts",
    });
    expect(repo.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenHash: await hashToken(result.ticket),
        clientId: client,
        userId: "user-1",
        sessionId: "session-1",
        redirectUri: callback,
        state: "a+/=?&b",
      }),
    );
    const args = getSession.mock.calls[0][0];
    expect(args.query.disableCookieCache).toBe(true);
    expect(args.headers.get("authorization")).toBeNull();
  });
  test.for([
    "https://client.example/callback",
    "https://client.example/callback?existing=2",
    "https://client.example/callback?existing=1&evil=1",
    "https://client.example.evil/callback?existing=1",
  ])("refuses callback substitutions: %s", async (redirect_uri) => {
    await expect(oauth.prepare({ ...request(), redirect_uri }, headers())).rejects.toMatchObject({
      error: "invalid_request",
    });
    expect(repo.createRequest).not.toHaveBeenCalled();
  });
  test("requires a live cookie session", async () => {
    getSession.mockResolvedValue(null);
    await expect(oauth.prepare(request(), headers())).rejects.toMatchObject({ status: 401 });
  });
  test.for(["suspendedAt", "deletedAt"] as const)("blocks %s accounts", async (key) => {
    vi.mocked(users.findById).mockResolvedValue(userRow({ [key]: new Date() }));
    await expect(oauth.prepare(request(), headers())).rejects.toMatchObject({ status: 401 });
  });
  test.for([
    { response_type: "token" },
    { code_challenge: "x".repeat(43), code_challenge_method: "plain" },
    { code_challenge_method: "S256" },
    { code_challenge: "short", code_challenge_method: "S256" },
    { state: "x".repeat(2049) },
  ])("rejects malformed authorization %o", async (overrides) => {
    await expect(oauth.prepare({ ...request(), ...overrides }, headers())).rejects.toBeDefined();
    expect(repo.createRequest).not.toHaveBeenCalled();
  });
  test("accepts S256 PKCE and preserves its challenge", async () => {
    await oauth.prepare({ ...request(), code_challenge: "x".repeat(43), code_challenge_method: "S256" }, headers());
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ codeChallenge: "x".repeat(43) }));
  });
  test.for([undefined, "null", "https://evil.example"])(
    "refuses consent from Origin %o before consuming anything",
    async (value) => {
      const h = headers();
      if (value) h.set("origin", value);
      else h.delete("origin");
      await expect(oauth.decide({ ticket: "ticket", decision: "allow" }, h)).rejects.toMatchObject({ status: 403 });
      expect(repo.decide).not.toHaveBeenCalled();
    },
  );
  test.for(["allow", "deny"])("explicit %s preserves state and query parameters", async (decision) => {
    vi.mocked(repo.decide).mockResolvedValue({
      tokenHash: "hash",
      clientId: client,
      userId: "user-1",
      sessionId: "session-1",
      redirectUri: callback,
      state: "a+/=?&b",
      codeChallenge: null,
      scopes: "read:accounts",
      expiresAt: new Date(),
    });
    const target = new URL(await oauth.decide({ ticket: "ticket", decision }, headers()));
    expect(target.origin).toBe("https://client.example");
    expect(target.searchParams.get("existing")).toBe("1");
    expect(target.searchParams.get("state")).toBe("a+/=?&b");
    const codeMatcher = expect.stringMatching(/^[\w-]{43}$/);
    const hashMatcher = expect.any(String);
    expect(target.searchParams.get("code")).toEqual(decision === "allow" ? codeMatcher : null);
    expect(target.searchParams.get("error")).toBe(decision === "allow" ? null : "access_denied");
    expect(repo.decide).toHaveBeenCalledWith(
      await hashToken("ticket"),
      "user-1",
      "session-1",
      decision === "allow" ? hashMatcher : null,
    );
  });
  test("expired, replayed, or wrong-session tickets fail locally, without a redirect", async () => {
    vi.mocked(repo.decide).mockResolvedValue(undefined);
    await expect(oauth.decide({ ticket: "ticket", decision: "allow" }, headers())).rejects.toMatchObject({
      error: "invalid_request",
    });
  });
});

describe("token exchange", () => {
  test("only issues an expiring, hashed, identity-only credential", async () => {
    const result = await oauth.exchange(exchange());
    expect(result).toMatchObject({ token_type: "Bearer", scope: "read:accounts", expires_in: 3600 });
    expect(result.access_token).toMatch(/^omi_id_[\w-]{43}$/);
    expect(repo.exchange).toHaveBeenCalledWith(
      await hashToken("fixture-code"),
      await hashToken(result.access_token),
      expect.any(Date),
      undefined,
    );
    expect(result).not.toHaveProperty("refresh_token");
  });
  test("authenticates the client before inspecting a code", async () => {
    await expect(oauth.exchange({ ...exchange(), client_secret: "wrong" })).rejects.toMatchObject({
      error: "invalid_client",
      status: 401,
    });
    expect(repo.findCode).not.toHaveBeenCalled();
  });
  test.for(["password", "client_credentials", "implicit"])("rejects grant %s", async (grant_type) => {
    await expect(oauth.exchange({ ...exchange(), grant_type })).rejects.toMatchObject({
      error: "unsupported_grant_type",
    });
  });
  test("does not allow scope escalation", async () => {
    await expect(oauth.exchange({ ...exchange(), scope: "write" })).rejects.toMatchObject({ error: "invalid_scope" });
    expect(repo.exchange).not.toHaveBeenCalled();
  });
  test("binds codes to the client and exact callback, revoking a previously exchanged code on replay", async () => {
    vi.mocked(repo.findCode).mockResolvedValue(undefined);
    await expect(oauth.exchange(exchange())).rejects.toMatchObject({ error: "invalid_grant" });
    expect(repo.findCode).toHaveBeenCalledWith(await hashToken("fixture-code"), client, callback);
    expect(repo.revokeCode).toHaveBeenCalledWith(await hashToken("fixture-code"), client);
  });
  test("a concurrent exchange loser cannot issue another token", async () => {
    vi.mocked(repo.exchange).mockResolvedValue(false);
    await expect(oauth.exchange(exchange())).rejects.toMatchObject({ error: "invalid_grant" });
    expect(repo.revokeCode).toHaveBeenCalled();
  });
  test("S256 verifies the exact challenge; failures do not consume the code", async () => {
    const verifier = "a".repeat(43);
    vi.mocked(repo.findCode).mockResolvedValue({
      ...code(),
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    await expect(oauth.exchange(exchange())).rejects.toMatchObject({ error: "invalid_grant" });
    await expect(oauth.exchange({ ...exchange(), code_verifier: "b".repeat(43) })).rejects.toMatchObject({
      error: "invalid_grant",
    });
    expect(repo.exchange).not.toHaveBeenCalled();
    await expect(oauth.exchange({ ...exchange(), code_verifier: verifier })).resolves.toBeDefined();
  });
  test("rejects a verifier if no challenge was authorized", async () => {
    await expect(oauth.exchange({ ...exchange(), code_verifier: "a".repeat(43) })).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });
});

describe("identity and revocation", () => {
  const bearer = () => new Headers({ authorization: `Bearer omi_id_${"a".repeat(43)}` });
  test("returns only the advertised public identity, never email, roles, or credentials", async () => {
    vi.mocked(repo.findToken).mockResolvedValue({
      id: "id",
      userId: "user-1",
      clientId: client,
      tokenHash: "hash",
      codeHash: "hash",
      redirectUri: callback,
      createdAt: new Date(),
      expiresAt: new Date(),
      scopes: "read:accounts",
      refreshExpiresAt: null,
    });
    const result = await oauth.verify(bearer());
    expect(result).toEqual({
      id: "user-1",
      username: "ada",
      acct: "ada",
      display_name: "Ada",
      url: `${origin}/@ada`,
      uri: `${origin}/users/ada`,
    });
  });
  test.for(["", "Bearer normal-session-token", "Bearer jwt.token.value"])(
    "never accepts browser credentials at the identity API (%s)",
    async (authorization) => {
      await expect(oauth.verify(new Headers({ authorization, cookie: "session=fixture" }))).rejects.toMatchObject({
        error: "invalid_token",
        status: 401,
      });
      expect(repo.findToken).not.toHaveBeenCalled();
    },
  );
  test("expired and revoked credentials are refused", async () => {
    vi.mocked(repo.findToken).mockResolvedValue(undefined);
    await expect(oauth.verify(bearer())).rejects.toMatchObject({ error: "invalid_token" });
  });
  test("revocation is authenticated, client-bound, and idempotent", async () => {
    await oauth.revoke({ client_id: client, client_secret: secret, token: "unknown" });
    expect(repo.revokeToken).toHaveBeenCalledWith(await hashToken("unknown"), client);
  });
  test("connected applications only expose the signed-in owner's records", async () => {
    vi.mocked(repo.listConnections).mockResolvedValue([]);
    await expect(oauth.connections(headers())).resolves.toEqual([]);
    expect(repo.listConnections).toHaveBeenCalledWith("user-1");
    const id = "00000000-0000-4000-8000-000000000001";
    await oauth.disconnect(id, headers());
    expect(repo.removeConnection).toHaveBeenCalledWith(id, "user-1");
  });
  test("metadata advertises only implemented flows and scopes", async () => {
    expect(await oauth.metadata()).toMatchObject({
      issuer: origin,
      scopes_supported: expect.arrayContaining(["read:accounts", "read", "write", "admin:read", "admin:write"]),
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
    });
  });
});

describe("third-party applications", () => {
  test("registers public native clients with URI arrays and no reusable secret", async () => {
    const result = await oauth.register({
      client_name: "Reader",
      redirect_uris: ["org.example.reader:/oauth/callback"],
      scopes: "read write",
      token_endpoint_auth_method: "none",
    });
    expect(result).toMatchObject({
      token_endpoint_auth_method: "none",
      scopes: ["read", "write"],
      redirect_uris: ["org.example.reader:/oauth/callback"],
    });
    expect(result).not.toHaveProperty("client_secret");
    expect(repo.createApp).toHaveBeenCalledWith(expect.objectContaining({ publicClient: true, scopes: "read write" }));
  });
  test("API access requires PKCE and cannot exceed the registered scopes", async () => {
    vi.mocked(repo.findApp).mockResolvedValue({ ...(await app()), scopes: "read write" });
    await expect(oauth.prepare({ ...request(), scope: "read write" }, headers())).rejects.toMatchObject({
      error: "invalid_request",
    });
    await expect(
      oauth.prepare(
        { ...request(), scope: "admin:write", code_challenge: "x".repeat(43), code_challenge_method: "S256" },
        headers(),
      ),
    ).rejects.toMatchObject({ error: "invalid_scope" });
    const consent = await oauth.prepare(
      { ...request(), scope: "read write", code_challenge: "x".repeat(43), code_challenge_method: "S256" },
      headers(),
    );
    expect(consent).toMatchObject({
      scope: "read write",
      renewable: true,
      permissions: expect.arrayContaining([expect.objectContaining({ scope: "write" })]),
    });
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ scopes: "read write" }));
  });
  test("public clients require PKCE even for identity and cannot submit a secret", async () => {
    vi.mocked(repo.findApp).mockResolvedValue({ ...(await app()), publicClient: true });
    await expect(oauth.prepare(request(), headers())).rejects.toMatchObject({ error: "invalid_request" });
    await expect(oauth.exchange(exchange())).rejects.toMatchObject({ error: "invalid_client" });
  });
  test("issues renewable API credentials with the approved scopes, storing only hashes", async () => {
    const verifier = "a".repeat(43);
    vi.mocked(repo.findCode).mockResolvedValue({
      ...code(),
      scopes: "read write",
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    const result = await oauth.exchange({ ...exchange(), code_verifier: verifier });
    expect(result.access_token).toMatch(/^omi_at_[\w-]{43}$/);
    expect(result.refresh_token).toMatch(/^omi_rt_[\w-]{43}$/);
    expect(result.scope).toBe("read write");
    expect(repo.exchange).toHaveBeenCalledWith(
      await hashToken("fixture-code"),
      await hashToken(result.access_token),
      expect.any(Date),
      { tokenHash: await hashToken(result.refresh_token!), expiresAt: expect.any(Date) },
    );
  });
  test("refresh preserves permissions, rotates both secrets, and refuses unavailable accounts", async () => {
    vi.mocked(repo.findRefresh).mockResolvedValue({
      id: "grant",
      userId: "user-1",
      scopes: "read write",
      refreshExpiresAt: new Date(Date.now() + 86400_000),
    } as never);
    vi.mocked(repo.refresh).mockResolvedValue(true);
    const input = {
      client_id: client,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    };
    await expect(oauth.exchange({ ...input, scope: "admin:write" })).rejects.toMatchObject({ error: "invalid_scope" });
    expect(repo.refresh).not.toHaveBeenCalled();
    const result = await oauth.exchange(input);
    expect(result.scope).toBe("read write");
    expect(repo.refresh).toHaveBeenCalledWith(
      await hashToken("old-refresh"),
      client,
      await hashToken(result.access_token),
      await hashToken(result.refresh_token!),
      expect.any(Date),
    );
    vi.mocked(users.findById).mockResolvedValue(userRow({ suspendedAt: new Date() }));
    await expect(oauth.exchange(input)).rejects.toMatchObject({ error: "invalid_grant" });
    vi.mocked(users.findById).mockResolvedValue(userRow());
    vi.mocked(repo.refresh).mockResolvedValue(false);
    await expect(oauth.exchange(input)).rejects.toMatchObject({ error: "invalid_grant" });
  });
});
