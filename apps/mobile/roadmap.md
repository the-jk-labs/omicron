# Product Roadmap

## Planning Rules

- Status values are `Planned`, `In progress`, `Blocked`, and `Done`.
- A release is complete only when every exit criterion is met and its documentation, tests, and API-gap entries are current.
- A feature may not rely on an undocumented endpoint, response field, editor payload, pagination scheme, or authentication transport.
- New work belongs in the earliest release whose exit criteria it supports. Cross-release work requires an ADR in `docs/adr/`.

## Product State

The Android-first Kotlin Multiplatform foundation and instance connection are complete. The app can normalize an HTTPS origin, retrieve `GET /api/instance`, retain public configuration, and recover the selected instance. Android is the active target; `commonMain` remains the location for product code shared by future targets.

## R0: Foundation And Design System

**Status:** Done

**Outcome:** A reproducible Android app baseline that expresses Omicron's visual language.

**Exit criteria:**

- Gradle wrapper, release shrinking, edge-to-edge entry point, debug build, lint, and unit-test workflow are present.
- `OmicronTheme` reflects the web color, radius, shadow, and font-stack tokens.
- RikkaUI primitives and Lucide RikkaIcons are the only UI primitive and icon systems.
- Android launcher and in-app branding use the canonical Omicron mark.

## R1: Identity And Account

**Status:** In progress

**Outcome:** A user can choose an instance, establish or restore a Better Auth session, and safely leave it.

**Completed:** HTTPS origin normalization, public instance metadata retrieval, persisted instance configuration, loading, invalid-address, unreachable, retry, and connected states; type-safe navigation and dependency wiring; Android Keystore-encrypted per-origin Better Auth cookie persistence; and session restoration that mints an in-memory JWT.

**Remaining exit criteria:**

- Implement Better Auth email and username sign-in, registration, verification-required state, sign-out, and account switching from confirmed `/api/auth/*` behavior.
- Refresh the 15-minute JWT before expiry and authenticate normal API calls with `Authorization: Bearer` only to the selected origin.
- Add UI tests for first connection, invalid origin, offline retry, sign-in, session restoration, and sign-out.

## R2: Guest Reader

**Status:** Planned

**Outcome:** A guest can discover and read public Omicron posts natively.

**Exit criteria:**

- Global and Local timelines use confirmed `GET /api/posts` scopes and opaque cursors unchanged.
- Post detail renders supported sanitized `contentHtml` natively, with cover media, author metadata, tags, and related posts.
- Every list has loading, empty, error, offline, refresh, retry, stable keys, and content types.
- Unsupported sanitized HTML is documented before considering a WebView.
- Image loading, media origin resolution, cache boundaries, and reader tests are introduced with this release.

## R3: Signed-In Reading And Social

**Status:** Planned

**Outcome:** Signed-in readers can use their feed and interact safely with posts and people.

**Exit criteria:**

- The `GET /api/feed` merged cursor is preserved exactly for the For you timeline.
- Likes, recommendations, saves, comments, follow, mute, and block use optimistic state with rollback and error recovery.
- Local and supported remote profiles expose their confirmed post, recommendation, follower, and following surfaces.
- Session loss, forbidden actions, and offline mutations have explicit recovery states.

## R4: Discovery

**Status:** Planned

**Outcome:** Readers can find content, tags, topics, and people.

**Exit criteria:**

- Search implements the server-supported article, tag, and person scopes and filters.
- Tag pages, trending posts, suggested people, and topics use confirmed discovery endpoints.
- Non-paginated server results are represented honestly; the client never manufactures cursors or offsets.

## R5: Authoring And Management

**Status:** Planned

**Outcome:** Authors can create, recover, publish, and manage posts without relying on opaque web-editor data.

**Exit criteria:**

- A mobile editor converts its authoring format losslessly into accepted sanitized HTML.
- Drafts, uploads, publishing, scheduling, and failure recovery use confirmed server behavior.
- Post management and dashboard surfaces follow only after reader and authoring reliability are established.

## R6: Settings And Release Readiness

**Status:** Planned

**Outcome:** The app is accessible, maintainable, observable through local quality gates, and ready for release review.

**Exit criteria:**

- Instance management, appearance, about, and sign-out are complete.
- Offline reading and cache eviction behavior are documented and tested.
- Licensed Inter and Source Sans 3 assets achieve typography parity with the web client.
- Release build, R8, startup, baseline profile, accessibility, font-scale, light/dark, and device visual checks pass.
- README, architecture docs, ADRs, and API gaps reflect the shipped behavior.

## Confirmed API Inventory

| Product need | Confirmed API |
| --- | --- |
| Instance metadata | `GET /api/instance` |
| Session | Better Auth under `/api/auth/*`; `GET /api/auth/get-session`; `POST /api/auth/sign-out` |
| JWT API authentication | `GET /api/auth/token`; public `GET /api/auth/jwks`; normal `/api/*` routes accept the signed JWT as `Authorization: Bearer` |
| Global and Local posts | `GET /api/posts`, with `scope=local`, opaque `cursor`, and language filters |
| Following feed | `GET /api/feed?cursor=...` |
| Post and comments | `GET /api/posts/:id`, `GET /api/posts/by/:username/:slug`, `GET /api/posts/:id/comments?cursor=...` |
| Post interactions | `POST` or `DELETE` `/api/posts/:id/like` and `/recommend`; comments under `/api/posts/:id/comments` |
| Profiles | `/api/users/:username`, `/posts`, `/recommendations`, `/followers`, `/following`; remote equivalents under `/api/remote/users/:handle` when federation is enabled |
| Search and tags | `/api/search`, `/api/tags`, `/api/tags/:slug`, `/api/tags/:slug/posts` |
| Discovery | `/api/posts/trending`, `/api/posts/:id/related`, `/api/users/suggested` |
| Publishing | `POST` and `PATCH /api/posts`; HTML content is required; raw image upload is `POST /api/uploads` |

All regular pages use opaque cursor/keyset pagination and return `{items,nextCursor}`. Never calculate, decode, or replace a cursor. Feed cursors are opaque merged-stream state.

## API Gaps And Constraints

- JWTs expire after 15 minutes. Revoked sessions cannot mint a new token, but a previously issued JWT remains valid until expiry.
- JWT issuer and audience use Better Auth's configured public `APP_DOMAIN`; instance operators must keep it aligned with the deployed origin.
- No confirmed OAuth or device-auth flow exists.
- Email verification links target the web verification route. No Android App Link or deep-link handoff is confirmed.
- No push, WebSocket, SSE, or device-token API exists. Notifications are polling only.
- No public versioned schema or OpenAPI contract exists; `contract.ts` is compile-time frontend checking only.
- The live `omicron.blog` deployment returns 404 for `/healthz` and `/version` despite the backend defining those root routes. Instance bootstrap validates by retrieving the required public `/api/instance` metadata.
- Feed responses contain full HTML and editor JSON, with no mobile projection, fields selector, or page-size control.
- There is no documented portable rich-text authoring payload. The server requires HTML; `contentJson` is opaque web-editor data.
- Followers, following, and search have no cursor pagination. Search results are capped server-side.
- There is no delta-sync or offline-sync endpoint.
- Remote profile routes return 404 when federation is disabled.
