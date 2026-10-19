import { Buffer } from "node:buffer";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { auth } from "@/auth/auth.ts";
import * as oauthRepo from "@/db/repositories/oauth.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { forbidden, unauthorized } from "@/lib/http.ts";
import { hashToken } from "@/lib/tokens.ts";
import { getOrigin } from "@/services/instanceSetup.ts";

export const IDENTITY_SCOPE = "read:accounts";
export const TOKEN_TTL_SECONDS = 3600;
const opaque = () => randomBytes(32).toString("base64url");

export class OAuthError extends Error {
  constructor(
    public error: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

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
    scopes_supported: [IDENTITY_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
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

function scope(input: Input) {
  if (text(input, "scope", 200, false) !== IDENTITY_SCOPE) {
    throw new OAuthError("invalid_scope", `Only ${IDENTITY_SCOPE} is supported. Request it explicitly.`);
  }
}

function webUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OAuthError("invalid_request", "A valid HTTPS URL is required.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && local)) ||
    url.username ||
    url.password ||
    url.hash ||
    raw.includes("#")
  ) {
    throw new OAuthError(
      "invalid_request",
      "Use HTTPS URLs without credentials or fragments (HTTP is allowed on loopback only).",
    );
  }
  return url;
}

export async function register(input: Input) {
  const name = text(input, "client_name", 100).trim();
  if (!name) throw new OAuthError("invalid_request", "Invalid client_name.");
  // Mastodon calls this field `scopes` at registration and `scope` at authorization.
  scope({ scope: input.scopes });
  const rawRedirects = input.redirect_uris;
  const redirects = text(
    { redirect_uris: typeof rawRedirects === "string" ? rawRedirects.replace(/[\r\n\t]/g, " ") : rawRedirects },
    "redirect_uris",
    8192,
  )
    .trim()
    .split(/\s+/);
  if (!redirects.length || redirects.length > 10)
    throw new OAuthError("invalid_request", "Register between one and ten callback URLs.");
  for (const raw of redirects) {
    const url = webUrl(raw);
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
    website: website || null,
  });
  return {
    id: clientId,
    name,
    website: website || null,
    redirect_uri: redirects.join("\n"),
    client_id: clientId,
    client_secret: clientSecret,
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
  scope(input);
  const state = text(input, "state", 2048, false);
  const challenge = text(input, "code_challenge", 128, false);
  const method = text(input, "code_challenge_method", 30, false);
  if ((challenge || method) && (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || method !== "S256")) {
    throw new OAuthError("invalid_request", "PKCE requires an S256 challenge.");
  }
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
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return {
    ticket,
    name: app.name,
    callbackOrigin: new URL(redirectUri).origin,
    username: user.username,
    scope: IDENTITY_SCOPE,
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
  const secret = text(input, "client_secret", 200);
  const app = await oauthRepo.findApp(id);
  const hash = await hashToken(secret);
  if (!app || !timingSafeEqual(Buffer.from(hash), Buffer.from(app.secretHash))) {
    throw new OAuthError("invalid_client", "Invalid client credentials.", 401);
  }
  return app;
}

export async function exchange(input: Input) {
  const app = await authenticateClient(input);
  if (text(input, "grant_type", 100) !== "authorization_code")
    throw new OAuthError("unsupported_grant_type", "Only authorization_code is supported.");
  if (input.scope !== undefined) scope(input);
  const codeHash = await hashToken(text(input, "code", 200));
  const redirectUri = text(input, "redirect_uri");
  const code = await oauthRepo.findCode(codeHash, app.id, redirectUri);
  if (!code) {
    await oauthRepo.revokeCode(codeHash, app.id);
    throw new OAuthError("invalid_grant", "Invalid, expired, or already used authorization code.");
  }
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
  const token = `omi_id_${opaque()}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  if (!(await oauthRepo.exchange(codeHash, await hashToken(token), expiresAt))) {
    await oauthRepo.revokeCode(codeHash, app.id);
    throw new OAuthError("invalid_grant", "Authorization code already used.");
  }
  return {
    access_token: token,
    token_type: "Bearer",
    scope: IDENTITY_SCOPE,
    created_at: Math.floor(Date.now() / 1000),
    expires_in: TOKEN_TTL_SECONDS,
  };
}

export async function revoke(input: Input) {
  const app = await authenticateClient(input);
  await oauthRepo.revokeToken(await hashToken(text(input, "token", 200)), app.id);
}

export async function verify(headers: Headers) {
  const match = /^Bearer (omi_id_[A-Za-z0-9_-]{43})$/i.exec(headers.get("authorization") ?? "");
  const token = match ? await oauthRepo.findToken(await hashToken(match[1])) : null;
  const user = token ? await usersRepo.findById(token.userId) : null;
  if (!user || user.suspendedAt || user.deletedAt)
    throw new OAuthError("invalid_token", "A valid identity access token is required.", 401);
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

export async function connections(headers: Headers) {
  const { user } = await browserIdentity(headers);
  const rows = await oauthRepo.listConnections(user.id);
  return rows.map(({ redirectUri, ...row }) => ({ ...row, callbackOrigin: new URL(redirectUri).origin }));
}

export async function disconnect(id: string, headers: Headers) {
  await requireSameOrigin(headers);
  const { user } = await browserIdentity(headers);
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id))
    throw new OAuthError("invalid_request", "Invalid connection ID.");
  await oauthRepo.removeConnection(id, user.id);
}
