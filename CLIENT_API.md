# Building Omicron clients

Omicron clients use the same `/api` as the web and Android apps. Any developer
can register an application on an instance without administrator approval and
ask an account owner to authorize it. ActivityPub is the federation protocol,
not the client API. Mastodon-style authorization does **not** make Omicron a
Mastodon API server or make existing Mastodon applications compatible.

## Discover the instance and API

Use HTTPS in production. Fetch these without credentials:

- `GET /api/instance`: instance identity, configuration, rules, and whether
  federation is available.
- `GET /api/client`: API version, OAuth endpoints, supported scopes and their
  descriptions, and the complete delegated operation list (`method`, `path`,
  and required `scope`). `:parameters` in paths are URL-encoded path segments.
- `GET /.well-known/oauth-authorization-server`: OAuth server metadata,
  available whether federation is on or off.

`apiVersion: 1` identifies the existing Omicron JSON contract, rooted at `/api`.
Clients must tolerate additive fields and newly advertised operations/scopes.
Removing or changing the meaning/type of existing contract fields requires an
explicit API-version change, not a silent patch. Check capabilities instead of
guessing from an instance's software version. A newer client must handle older
instances without this discovery endpoint as lacking delegated client access;
do not fall back to collecting their password.

The existing HTTP and admin references are at
<https://docs.omicron.blog/reference/http-api/> and
<https://docs.omicron.blog/reference/admin-api/>. The source-level contracts are
[`apps/frontend/src/lib/api/index.ts`](apps/frontend/src/lib/api/index.ts)
(request fields and operations),
[`apps/frontend/src/lib/api/contract.ts`](apps/frontend/src/lib/api/contract.ts)
(JSON response types), and the backend route validators/serializers. The
instance's `/api/client` is authoritative for delegated scopes.

## Register an application

Send JSON or `application/x-www-form-urlencoded` to `POST /api/v1/apps`:

```json
{
  "client_name": "Example Omicron Reader",
  "redirect_uris": ["org.example.reader:/oauth/callback"],
  "scopes": "read write",
  "token_endpoint_auth_method": "none",
  "website": "https://example.org/reader"
}
```

The response includes `client_id`, `scopes`, and `redirect_uris`. Registrations
are per instance. Keep the client ID with that instance's origin. Public and
client-API registrations do not expire through inactivity. Unapproved legacy
identity-only confidential registrations are cleaned up after 30 days.

- Native and browser applications are **public clients**: explicitly request
  `token_endpoint_auth_method: "none"`. They receive no client secret and must
  use S256 PKCE. Do not embed a confidential secret in a distributable app.
- A server-side confidential application can omit that field. It receives a
  `client_secret` once and can authenticate at token/revocation endpoints using
  HTTP Basic or body `client_id`/`client_secret`, but never both. Keep the secret
  on your server. `client_secret_expires_at: 0` means no scheduled expiration.
- Redirect URIs can be an array or a whitespace-separated string, with at most
  ten exact callbacks. HTTPS callbacks, loopback HTTP callbacks for desktop or
  local development, and reverse-domain native schemes such as the example
  above are supported. Match redirect URIs exactly, including ports and query
  strings. Register a chosen loopback port before authorization.
- Credentials, fragments, wildcards, executable schemes, out-of-band codes,
  and pre-existing OAuth response query parameters are not accepted.
- Registration without `scopes` defaults to legacy identity-only
  `read:accounts`. Always request your intended permissions explicitly.

## Authorize through the system browser

For each attempt, generate a cryptographically random `state` and PKCE
`code_verifier`. The verifier is 43–128 unreserved ASCII characters; derive
`code_challenge = BASE64URL(SHA256(code_verifier))`, without padding. Store the
verifier and state locally, bound to this attempt and instance.

Open the instance's `/oauth/authorize` in the system browser with:

```text
response_type=code
client_id=<registered client ID>
redirect_uri=<exact registered callback>
scope=read write
state=<random attempt state>
code_challenge=<derived challenge>
code_challenge_method=S256
```

URL-encode every value. The requested scope must be a subset of the registered
permissions. The user signs in on their own instance and explicitly approves
or denies the displayed permissions. Your app must not collect passwords,
session cookies, passkeys, or Better Auth JWTs.

Validate the callback destination and exact saved `state` before accepting
either success or denial. An approved callback has a one-use `code`; denial has
`error=access_denied`. Clear the pending attempt once handled. Never log the
code or callback query. Prefer claimed HTTPS app links where the OS supports
them; custom schemes are also supported, with PKCE protecting intercepted codes.

Exchange the code using `POST /oauth/token`:

```json
{
  "client_id": "<registered client ID>",
  "grant_type": "authorization_code",
  "redirect_uri": "org.example.reader:/oauth/callback",
  "code": "<returned code>",
  "code_verifier": "<saved verifier>"
}
```

Public clients omit `client_secret`. Confidential clients authenticate as
described above. Consent expires after ten minutes, authorization codes after
five minutes. All new client API grants require S256 PKCE, including
confidential applications. Only legacy identity-only confidential web flows
can omit it.

The response contains `access_token`, `token_type: "Bearer"`, the approved
`scope`, `created_at`, `expires_in`, and a `refresh_token` for API grants. Protect
these credentials like a password. They belong to one account and instance;
never send them to a different origin or attach them to remote image URLs.

## Use the complete Omicron API

Send `Authorization: Bearer <access_token>` to the authorized instance's `/api`
operations. No cookies or extra JWT exchange are required. Browser clients
must use `credentials: "omit"`; the server supports bearer-token CORS and
preflight, not cross-origin session cookies. Use JSON requests from browser
clients, including token exchange and revocation, so local SvelteKit development
proxies do not reject cross-origin form submissions as CSRF.

A full ordinary client requests `read write`. Granular permissions, listed in
`/api/client`, allow narrower applications. `read` includes `read:*` and `write`
includes `write:*`; neither includes `admin:*`. Existing `read:accounts` grants
remain **public-identity-only** and cannot access `/api/me`, drafts, or writes.

| Feature | Operations | Granular scope |
| --- | --- | --- |
| Full self/profile view | `GET /api/me`, profiles | `read:profile` |
| Edit profile, avatar, privacy, preferences | `/api/users/me` and its editing endpoints | `write:accounts` |
| Timelines, feed, drafts, scheduled/published posts | `GET /api/posts*`, `/api/feed`, author/tag post lists | `read:posts` |
| Compose, schedule, publish, edit, delete, like, recommend | Post mutations | `write:posts` |
| Read or interact with comments/replies | Comment reads or mutations | `read:comments`, `write:comments` |
| Private/public reading lists and bookmarks | List reads or mutations | `read:lists`, `write:lists` |
| Follows, followed tags, followers, follow requests | Relationship reads or mutations | `read:follows`, `write:follows` |
| Mutes and blocks, local or remote | Relation reads or mutations | `read:mutes`, `write:mutes`, `read:blocks`, `write:blocks` |
| Notifications and read state | Notification reads or mutations | `read:notifications`, `write:notifications` |
| Writer statistics | `GET /api/dashboard` | `read:analytics` |
| Search and tag discovery | `/api/search`, tag discovery endpoints | `read:search` |
| Images and stock-photo picker | Raw uploads, photo providers/search/use | `write:media` |
| Reports | `POST /api/reports` | `write:reports` |
| Publishing integrations | Webhook-token listing/mutations | `read:integrations`, `write:integrations` |
| Moderation and instance administration | `/api/admin/*` | `admin:read`, `admin:write` plus the current account role |

Scope grants never bypass ownership, private-account visibility, moderation
roles, federation availability, validation, or rate limits. Usernames are
permanent. Delegated publishing tokens can outlive their originating OAuth
grant: disclose that explicitly and revoke those tokens separately when needed.

For a minimal end-to-end publishing flow:

1. `GET /api/me` returns `{ "user": ... }` with the signed-in account.
2. `POST /api/posts` with `{ "title": "Hello", "contentHtml": "<p>Body</p>",
   "status": "draft" }` returns `201` and `{ "post": ... }`.
3. `PATCH /api/posts/:id` with `{ "status": "published" }` publishes it.
   Use `"scheduled"` plus an ISO `publishAt` for scheduling; when publishing or
   returning to draft, send `publishAt: null` if replacing a scheduled state.
4. `GET /api/posts/:id` returns `{ "post": ... }`, including sanitized HTML.
5. `DELETE /api/posts/:id` returns `{ "ok": true }`.

Post editors can submit HTML without Tiptap. `contentJson` is optional opaque
Tiptap data, not a required editor format. Comments are plain text. Image
uploads send raw bytes with the image MIME `Content-Type`, not multipart form
data. Resolve root-relative returned media URLs against the instance origin.

Paginated core resources return `{ items, nextCursor }`; some admin resources
have named collections. Pass opaque cursors back unchanged and URL-encoded.
Never construct cursors or replace them with offsets. Dates are ISO strings
and IDs are opaque strings. Follow endpoint-specific pagination exceptions in
the HTTP reference, rather than treating every collection identically.

`GET /api/v1/accounts/verify_credentials` returns the minimal public identity
for `read:accounts` (or `read`). `GET /api/v1/apps/verify_credentials` returns
the current application's non-secret details and this grant's scopes for any
valid OAuth access token. Neither is a complete Mastodon entity/API contract.

## Renewal, revocation, and failures

Access tokens last one hour. API grants can be renewed for an absolute maximum
of 90 days from issuance. Before expiry, POST to `/oauth/token` with
`grant_type=refresh_token`, `client_id`, and `refresh_token`; confidential
clients also authenticate. Omit `scope`, or send the unchanged approved scope.
Renewal cannot widen or change permissions.

Each successful refresh replaces **both** access and refresh tokens. Store the
new pair atomically, and serialize refresh per account: retrying a used refresh
token revokes the whole grant, including its successor. Never automatically
retry an ambiguous refresh after a transport failure; reauthorize if the result
cannot be recovered. Old access tokens stop working immediately. Respect the
returned `expires_in`, which can be shorter near the grant's absolute expiry.

On logout, POST `/oauth/revoke` with your client authentication and `token`
(current access token or any refresh token belonging to that grant), then erase
your local credentials and account-specific caches. Revocation is idempotent
and invalidates renewal too. Users can also revoke grants from Settings →
Integrations → Connected applications on their instance. Keep access to that
screen available in your client.

- OAuth errors have `error` and `error_description`. `401 invalid_token` means
  expired, revoked, or unavailable-account access; renew once if possible,
  otherwise authorize again. Never fall back to a browser session.
- `403 insufficient_scope` includes `WWW-Authenticate` with the required scope
  when available. Request new consent rather than retrying. A normal `403` can
  instead indicate an ownership/role restriction.
- Token endpoint `invalid_grant` requires a new authorization flow. Wrong
  credentials produce `invalid_client`; do not repeatedly retry them.
- Normal API validation/business errors use `{ error, field? }`. Handle
  non-JSON reverse-proxy errors too. Honor `429` and `Retry-After`.
- Suspended/deleted accounts immediately lose access and renewal. Role changes
  apply to the next request. Federation-off instances return normal errors for
  remote-only actions; do not disable unrelated local features.

Registration, publishing, and browser consent are intentionally different
trust boundaries. Setup, login/registration, password/email/passkey/session
management, and management of other OAuth connections are not delegated to
third-party tokens. Open the instance's own `/settings` or login/registration
screens in the system browser for those account-security tasks. This is not a
missing password-collection API. Password-confirmed administration actions
(account deletion and role changes) likewise retain their existing confirmation
requirements; open `/admin` for those actions instead of collecting an
administrator's password in your application.

## Deployment

No new environment variables are required. Back up and verify a restic
snapshot **before upgrading**. The additive OAuth migration runs on backend
startup and preserves existing identity-only registrations, codes and tokens
without widening their permissions. Deploy backend and frontend together.

The updated `Caddyfile` sends the API and OAuth transports directly to the
backend, so Anubis cannot serve a JavaScript challenge to API clients or CORS
preflights. Recreate Caddy after updating the bind-mounted file (for example,
`podman compose up -d --force-recreate caddy`); a plain app restart is not
enough. Custom proxies must preserve Authorization, OAuth/CORS response
headers, request bodies, methods, and preflights and must keep
`/api/instance/tls-check` private. No production deployment is implied by
adding this support to the source tree.
