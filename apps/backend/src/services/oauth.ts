import { Buffer } from "node:buffer";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { auth } from "@/auth/auth.ts";
import * as oauthRepo from "@/db/repositories/oauth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { forbidden, unauthorized } from "@/lib/http.ts";
import { OAuthError } from "@/lib/oauthError.ts";
import { hashToken } from "@/lib/tokens.ts";
import { getOrigin } from "@/services/instanceSetup.ts";
import {
  IDENTITY_SCOPE,
  OAUTH_SCOPES,
  hasScope,
  parseScopes,
  permissions,
  scopesInclude,
} from "@/services/oauthScopes.ts";

export { IDENTITY_SCOPE, OAuthError };
export const TOKEN_TTL_SECONDS = 3600;
export const REFRESH_TTL_SECONDS = 90 * 86400;
const opaque = () => randomBytes(32).toString("base64url");

type Input = Record<string, unknown>;
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

export async function metadata() {
  const origin = await getOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    registration_endpoint: `${origin}/api/v1/apps`,
    scopes_supported: Object.keys(OAUTH_SCOPES),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    code_challenge_methods_supported: ["S256"],
  };
}
function text(input: Input, key: string, max = 2048, required = true): string {
  const value = input[key];
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || (required && !value) || value.length > max || CONTROL.test(value)) {
    throw new OAuthError("invalid_request", `Invalid ${key}.`);
  }
  return value;
}

function webUrl(raw: string, native = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OAuthError("invalid_request", "A valid HTTPS URL is required.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const custom = native && /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(url.protocol);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local) && !custom) ||
    url.username ||
    url.password ||
    url.hash ||
    raw.includes("#") ||
    raw.includes("*") ||
    raw.includes("\\") ||
    (custom && !url.pathname.startsWith("/"))
  ) {
    throw new OAuthError(
      "invalid_request",
      "Use HTTPS, loopback HTTP, or a reverse-domain native callback without credentials, wildcards, or fragments.",
    );
  }
  return url;
}

export function callbackDestination(raw: string) {
  const url = new URL(raw);
  return url.origin === "null" ? `${url.protocol}${url.host ? `//${url.host}` : ""}${url.pathname}` : url.origin;
}

export async function register(input: Input) {
  const name = text(input, "client_name", 100).trim();
  if (!name) throw new OAuthError("invalid_request", "Invalid client_name.");
  // Mastodon calls this field `scopes` at registration and `scope` at authorization.
  const scopes = parseScopes(input.scopes ?? IDENTITY_SCOPE);
  const method = text(input, "token_endpoint_auth_method", 100, false);
  if (method && !["none", "client_secret_basic", "client_secret_post"].includes(method))
    throw new OAuthError("invalid_request", "Unsupported token_endpoint_auth_method.");
  const publicClient = method === "none";
  const rawRedirects = input.redirect_uris;
  const redirects = text(
    {
      redirect_uris:
        Array.isArray(rawRedirects) && rawRedirects.every((uri) => typeof uri === "string")
          ? rawRedirects.join(" ")
          : typeof rawRedirects === "string"
            ? rawRedirects.replace(/[\r\n\t]/g, " ")
            : rawRedirects,
    },
    "redirect_uris",
    8192,
  )
    .trim()
    .split(/\s+/);
  if (!redirects.length || redirects.length > 10)
    throw new OAuthError("invalid_request", "Register between one and ten callback URLs.");
  for (const raw of redirects) {
    const url = webUrl(raw, true);
    if (["code", "state", "error", "error_description"].some((key) => url.searchParams.has(key))) {
      throw new OAuthError("invalid_request", "Callback URLs must not contain OAuth response parameters.");
    }
  }
  const website = text(input, "website", 2048, false);
  if (website) webUrl(website);
  const clientId = opaque();
  const clientSecret = opaque();
  await oauthRepo.createApp({
    id: clientId,
    secretHash: await hashToken(clientSecret),
    name,
    redirectUris: [...new Set(redirects)],
    scopes,
    publicClient,
    website: website || null,
  });
  return {
    id: clientId,
    name,
    website: website || null,
    redirect_uri: redirects.join("\n"),
    redirect_uris: [...new Set(redirects)],
    scopes: scopes.split(" "),
    client_id: clientId,
    ...(publicClient ? {} : { client_secret: clientSecret, client_secret_expires_at: 0 }),
    token_endpoint_auth_method: publicClient ? "none" : "client_secret_basic",
    vapid_key: "",
  };
}

// Browser consent never accepts JWTs or an identity token in place of a live cookie session.
export async function browserIdentity(headers: Headers) {
  const cookieHeaders = new Headers();
  const cookie = headers.get("cookie");
  if (cookie) cookieHeaders.set("cookie", cookie);
  const session = await auth.api.getSession({ headers: cookieHeaders, query: { disableCookieCache: true } });
  const user = session ? await usersRepo.findById(session.user.id) : null;
  if (!session || !user || user.suspendedAt || user.deletedAt) throw unauthorized("Sign in to continue.");
  return { user, sessionId: session.session.id };
}

export async function requireSameOrigin(headers: Headers) {
  if (headers.get("origin") !== (await getOrigin())) throw forbidden("A same-origin request is required.");
}

export async function prepare(input: Input, headers: Headers) {
  const clientId = text(input, "client_id", 100);
  const app = await oauthRepo.findApp(clientId);
  const redirectUri = text(input, "redirect_uri");
  if (!app || !app.redirectUris.includes(redirectUri))
    throw new OAuthError("invalid_request", "Unknown client or callback URL.");
  if (text(input, "response_type", 30) !== "code")
    throw new OAuthError("unsupported_response_type", "Only the authorization code flow is supported.");
  const scopes = parseScopes(input.scope);
  if (!scopesInclude(app.scopes, scopes))
    throw new OAuthError("invalid_scope", "Requested scope exceeds the application's registered permissions.");
  const state = text(input, "state", 2048, false);
  const challenge = text(input, "code_challenge", 128, false);
  const method = text(input, "code_challenge_method", 30, false);
  if ((challenge || method) && (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || method !== "S256")) {
    throw new OAuthError("invalid_request", "PKCE requires an S256 challenge.");
  }
  if (
    (app.publicClient || scopes !== IDENTITY_SCOPE || !["https:", "http:"].includes(new URL(redirectUri).protocol)) &&
    !challenge
  )
    throw new OAuthError("invalid_request", "S256 PKCE is required for client API access and public applications.");
  const { user, sessionId } = await browserIdentity(headers);
  const ticket = opaque();
  await oauthRepo.createRequest({
    tokenHash: await hashToken(ticket),
    clientId,
    userId: user.id,
    sessionId,
    redirectUri,
    state: input.state === undefined ? null : state,
    codeChallenge: challenge || null,
    scopes,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return {
    ticket,
    name: app.name,
    callbackOrigin: callbackDestination(redirectUri),
    username: user.username,
    scope: scopes,
    permissions: permissions(scopes),
    renewable: scopes !== IDENTITY_SCOPE,
  };
}

export async function decide(input: Input, headers: Headers) {
  await requireSameOrigin(headers);
  const { user, sessionId } = await browserIdentity(headers);
  const decision = text(input, "decision", 10);
  if (!["allow", "deny"].includes(decision)) throw new OAuthError("invalid_request", "Choose Allow or Deny.");
  const ticket = text(input, "ticket", 100);
  const code = decision === "allow" ? opaque() : null;
  const request = await oauthRepo.decide(
    await hashToken(ticket),
    user.id,
    sessionId,
    code ? await hashToken(code) : null,
  );
  if (!request)
    throw new OAuthError(
      "invalid_request",
      "This authorization request expired or was already used. Start again from the application.",
    );
  const target = new URL(request.redirectUri);
  if (request.state !== null) target.searchParams.set("state", request.state);
  if (code) target.searchParams.set("code", code);
  else target.searchParams.set("error", "access_denied");
  return target.href;
}

async function authenticateClient(input: Input) {
  const id = text(input, "client_id", 100);
  const secret = text(input, "client_secret", 200, false);
  const app = await oauthRepo.findApp(id);
  const hash = await hashToken(secret);
  if (
    !app ||
    (app.publicClient ? !!secret : !secret || !timingSafeEqual(Buffer.from(hash), Buffer.from(app.secretHash)))
  ) {
    throw new OAuthError("invalid_client", "Invalid client credentials.", 401);
  }
  return app;
}

export async function exchange(input: Input) {
  const app = await authenticateClient(input);
  const grantType = text(input, "grant_type", 100);
  if (grantType === "refresh_token") return refresh(input, app.id);
  if (grantType !== "authorization_code")
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  const codeHash = await hashToken(text(input, "code", 200));
  const redirectUri = text(input, "redirect_uri");
  const code = await oauthRepo.findCode(codeHash, app.id, redirectUri);
  if (!code) {
    await oauthRepo.revokeCode(codeHash, app.id);
    throw new OAuthError("invalid_grant", "Invalid, expired, or already used authorization code.");
  }
  if (input.scope !== undefined && parseScopes(input.scope) !== code.scopes)
    throw new OAuthError("invalid_scope", "The token scope must match the authorized scope.");
  const verifier = text(input, "code_verifier", 128, false);
  if (code.codeChallenge) {
    if (
      !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
      createHash("sha256").update(verifier).digest("base64url") !== code.codeChallenge
    ) {
      throw new OAuthError("invalid_grant", "Invalid PKCE verifier.");
    }
  } else if (verifier) throw new OAuthError("invalid_grant", "No PKCE challenge was authorized.");
  const user = await usersRepo.findById(code.userId);
  if (!user || user.suspendedAt || user.deletedAt) throw new OAuthError("invalid_grant", "The account is unavailable.");
  const renewable = code.scopes !== IDENTITY_SCOPE;
  const token = `${renewable ? "omi_at_" : "omi_id_"}${opaque()}`;
  const refreshToken = renewable ? `omi_rt_${opaque()}` : null;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  if (
    !(await oauthRepo.exchange(
      codeHash,
      await hashToken(token),
      expiresAt,
      refreshToken
        ? {
            tokenHash: await hashToken(refreshToken),
            expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
          }
        : undefined,
    ))
  ) {
    await oauthRepo.revokeCode(codeHash, app.id);
    throw new OAuthError("invalid_grant", "Authorization code already used.");
  }
  return {
    access_token: token,
    token_type: "Bearer",
    scope: code.scopes,
    created_at: Math.floor(Date.now() / 1000),
    expires_in: TOKEN_TTL_SECONDS,
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  };
}

async function refresh(input: Input, clientId: string) {
  const previous = await hashToken(text(input, "refresh_token", 200));
  const grant = await oauthRepo.findRefresh(previous, clientId);
  if (!grant) throw new OAuthError("invalid_grant", "Invalid or expired refresh token.");
  if (input.scope !== undefined && parseScopes(input.scope) !== grant.scopes)
    throw new OAuthError("invalid_scope", "Refresh cannot change the authorized scope.");
  const user = await usersRepo.findById(grant.userId);
  if (!user || user.suspendedAt || user.deletedAt) throw new OAuthError("invalid_grant", "The account is unavailable.");
  const token = `omi_at_${opaque()}`;
  const refreshToken = `omi_rt_${opaque()}`;
  const expiresAt = new Date(Math.min(Date.now() + TOKEN_TTL_SECONDS * 1000, grant.refreshExpiresAt!.getTime()));
  if (!(await oauthRepo.refresh(previous, clientId, await hashToken(token), await hashToken(refreshToken), expiresAt)))
    throw new OAuthError("invalid_grant", "Refresh token already used. Authorize the application again.");
  return {
    access_token: token,
    refresh_token: refreshToken,
    token_type: "Bearer",
    scope: grant.scopes,
    created_at: Math.floor(Date.now() / 1000),
    expires_in: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

export async function revoke(input: Input) {
  const app = await authenticateClient(input);
  await oauthRepo.revokeToken(await hashToken(text(input, "token", 200)), app.id);
}

export async function accessIdentity(headers: Headers) {
  const match = /^Bearer\s+(omi_(?:id|at)_[A-Za-z0-9_-]{43})$/i.exec(headers.get("authorization") ?? "");
  const token = match ? await oauthRepo.findToken(await hashToken(match[1])) : null;
  const user = token ? await usersRepo.findById(token.userId) : null;
  if (!user || user.suspendedAt || user.deletedAt)
    throw new OAuthError("invalid_token", "A valid OAuth access token is required.", 401);
  return { user, grant: token! };
}

export async function verify(headers: Headers) {
  const { user, grant } = await accessIdentity(headers);
  if (!hasScope(grant.scopes, IDENTITY_SCOPE))
    throw new OAuthError("insufficient_scope", "Public account access is required.", 403, IDENTITY_SCOPE);
  const origin = await getOrigin();
  return {
    id: user.id,
    username: user.username,
    acct: user.username,
    display_name: user.displayName,
    url: `${origin}/@${user.username}`,
    uri: `${origin}/users/${user.username}`,
  };
}

export async function verifyApp(headers: Headers) {
  const { grant } = await accessIdentity(headers);
  const app = await oauthRepo.findApp(grant.clientId);
  if (!app) throw new OAuthError("invalid_token", "The application is unavailable.", 401);
  return {
    id: app.id,
    name: app.name,
    website: app.website,
    scopes: grant.scopes.split(" "),
    redirect_uris: app.redirectUris,
  };
}

export async function connections(headers: Headers) {
  const { user } = await browserIdentity(headers);
  const rows = await oauthRepo.listConnections(user.id);
  return rows.map(({ redirectUri, scopes, ...row }) => ({
    ...row,
    scope: scopes,
    permissions: permissions(scopes),
    callbackOrigin: callbackDestination(redirectUri),
  }));
}

export async function disconnect(id: string, headers: Headers) {
  await requireSameOrigin(headers);
  const { user } = await browserIdentity(headers);
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
    throw new OAuthError("invalid_request", "Invalid connection ID.");
  await oauthRepo.removeConnection(id, user.id);
}
