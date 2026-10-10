# Product Roadmap

## Planning Rules

- Status values are `Planned`, `In progress`, `Blocked`, and `Done`.
- A release is complete only when every exit criterion is met and its documentation, tests, and API-gap entries are current.
- A feature may not rely on an undocumented endpoint, response field, editor payload, pagination scheme, or authentication transport.
- New work belongs in the earliest release whose exit criteria it supports. Cross-release work requires an ADR in `docs/adr/`.

## Product State

The Android-first Kotlin Multiplatform foundation, instance connection, guest reading, and signed-in social reading are complete. The app can normalize an HTTPS origin, retrieve `GET /api/instance`, retain public configuration, and recover the selected instance. Readers can browse Global/Local timelines and the authenticated For you feed, read posts natively with web-parity tables, syntax highlighting, and math, interact with posts and comments, and browse local or supported remote profiles. Android is the active target; `commonMain` remains the location for product code shared by future targets.

## R0: Foundation And Design System

**Status:** Done

**Outcome:** A reproducible Android app baseline that expresses Omicron's visual language.

**Exit criteria:**

- Gradle wrapper, release shrinking, edge-to-edge entry point, debug build, lint, and unit-test workflow are present.
- `OmicronTheme` reflects the web color, radius, shadow, and font-stack tokens.
- RikkaUI primitives and Lucide RikkaIcons are the only UI primitive and icon systems.
- Android launcher and in-app branding use the canonical Omicron mark.

## R1: Identity And Account

**Status:** Done

**Outcome:** A user can choose an instance, establish or restore a Better Auth session, and safely leave it.

**Completed:** HTTPS origin normalization, public instance metadata retrieval, persisted instance configuration, loading, invalid-address, unreachable, retry, and connected states; type-safe navigation and dependency wiring; Android Keystore-encrypted per-origin Better Auth cookie persistence; session restoration and lazy pre-expiry JWT renewal; email and username sign-in; registration; verification-required state; sign-out with local credential removal when remote revocation fails; account switching; and Compose UI tests for first connection, invalid origin, offline retry, sign-in, session restoration, and sign-out.

## R2: Guest Reader

**Status:** Done

**Outcome:** A guest can discover and read public Omicron posts natively.

**Completed:** Guest Global/Local timeline lists (`GET /api/posts` with confirmed scopes and opaque cursors preserved unchanged, loading, empty, error, offline, refresh, retry, stable keys and content types) with web-mobile-parity cards; post detail (`GET /api/posts/:id`, cover, natively rendered `contentHtml` with Coil image loading, author metadata, tags, counts, `related` read-next); bordered web-parity tables with wide-table scrolling; client-side syntax highlighting on the tokenized web palette; native MathML-subset formulas with TeX fallback; media URLs resolved against the instance origin; and connected Compose UI journeys for timeline content, empty, offline retry, scope switching, detail rendering, and not-found. No app-level content cache was introduced; images rely on Coil defaults.

**Exit criteria:**

- Global and Local timelines use confirmed `GET /api/posts` scopes and opaque cursors unchanged.
- Post detail renders supported sanitized `contentHtml` natively, with cover media, author metadata, tags, and related posts.
- Every list has loading, empty, error, offline, refresh, retry, stable keys, and content types.
- Unsupported sanitized HTML is documented before considering a WebView.
- Image loading, media origin resolution, cache boundaries, and reader tests are introduced with this release.

## R3: Signed-In Reading And Social

**Status:** Done

**Outcome:** Signed-in readers can use their feed and interact safely with posts and people.

**Completed:** Authenticated transport implements ADR-0004: app API calls send the in-memory JWT as `Authorization: Bearer` when a session exists and stay anonymous otherwise; a 401 invalidates the in-memory session, and confirmed Better Auth `UNAUTHORIZED` responses clear the stale per-origin cookie so sign-in recovery is available. The For you timeline (`GET /api/feed` with the merged cursor preserved exactly, cross-page duplicates removed client-side per the service contract) is offered first to signed-in readers with web-parity empty copy; scope labels retain natural width and the tab strip scrolls on narrow screens. Guests keep Local/Global, and an expired session falls back to Global with a visible sign-in action, distinct from intentional sign-out. Post likes, recommendations, and Read later saves use optimistic state with rollback; comments support listing, cursor pagination, replies, likes, editing, and deletion with failure recovery. Local and remote profiles expose posts and recommendations; local profiles additionally expose the confirmed follower/following member lists, while remote profiles show the server-provided counts. Follow, mute, and block actions reflect private-account requests and clear follow state when blocking. Navigation returns to the prior reading surface after sign-in. The connected Android Compose suite passed all 19 tests.

**Exit criteria:**

- The `GET /api/feed` merged cursor is preserved exactly for the For you timeline.
- Likes, recommendations, saves, comments, follow, mute, and block use optimistic state with rollback and error recovery.
- Local and supported remote profiles expose their confirmed post, recommendation, follower, and following surfaces.
- Session loss, forbidden actions, and offline mutations have explicit recovery states.

## R4: Discovery

**Status:** Done

**Outcome:** Readers can find content, tags, topics, and people.

**Completed:** Discovery data layer (`DiscoveryApi`, `KtorDiscoveryApi`, `DiscoveryRepository` with optional Bearer transport, opaque tag-post cursors preserved unchanged, blank-query short-circuit) and `feature.discovery` screens: search with article/tag/person tabs plus tag and author filters narrowing articles only, tag pages with counts, cursor-paginated posts, and optimistic follow with rollback, and a discover landing for trending posts, topics, and suggested people. Non-paginated server lists are rendered without manufactured cursors. Timeline header links to search and discover; all surfaces expose loading, empty, error, offline, and retry states. Unit coverage spans API, repository, and ViewModel layers with fake engines; 6 connected Compose journeys cover search prompt, results tabs, offline retry, discover sections, and tag detail.

**Exit criteria:**

- Search implements the server-supported article, tag, and person scopes and filters.
- Tag pages, trending posts, suggested people, and topics use confirmed discovery endpoints.
- Non-paginated server results are represented honestly; the client never manufactures cursors or offsets.

## R5: Authoring And Management

**Status:** Done

**Outcome:** Authors can create, recover, publish, and manage posts without relying on opaque web-editor data.

**Completed:** Authoring direction set by ADR-0011 (HTML-first, no `contentJson`, server drafts as recovery, no local draft store). Authoring data layer (`AuthoringApi`, `KtorAuthoringApi`, `AuthoringRepository` with required Bearer transport, omitted-when-untouched fields, raw-byte image uploads, opaque draft cursors preserved unchanged) with unit coverage for API, repository, and auth behavior. Composer block model (`ComposerBlock` with paragraph, heading, quote, code, lists, image, divider, and opaque `RawHtml` passthrough) converting losslessly into accepted sanitized HTML, with rich inline constructs preserved opaquely. `feature.composer` supports metadata and block editing, 2s server-draft autosave recovery, explicit save, publish validation, image and banner uploads, and schedule/reschedule/unschedule/publish-now with schedule-safe autosave. `feature.manage` provides Drafts, Scheduled, and Published lanes with counts, opaque-cursor pagination, continue/edit/view, schedule/reschedule/publish-now/unschedule/unpublish/delete actions, confirmation for destructive actions, retry/error/offline states, and reauthentication. The owner profile links to post management. Unit coverage exercises API/repository/ViewModel behavior; 11 connected Compose journeys cover authoring and management.

**Exit criteria:**

- A mobile editor converts its authoring format losslessly into accepted sanitized HTML.
- Drafts, uploads, publishing, scheduling, and failure recovery use confirmed server behavior.
- Post management and dashboard surfaces follow only after reader and authoring reliability are established.

## R6: Settings And Release Readiness

**Status:** In progress

**Outcome:** The app is accessible, maintainable, observable through local quality gates, and ready for release review.

**In progress:** Settings route is available from the timeline header and includes current-instance/change-instance controls, app About information, sign-out, and persistent System/Light/Dark appearance. Appearance is stored locally per Android installation and System follows the device preference (ADR-0012). Offline reading caches public article details by instance origin, with a Settings library and remove/clear controls: 50 entries/64 MiB total, 30-day freshness, least-recently-used eviction, and a separate 32 MiB Coil image cache. Drafts, schedules, feeds, comments, and viewer-specific social state are never cached (ADR-0013). Full-Unicode Inter and Source Sans 3 variable fonts are bundled with their OFL 1.1 notices and applied to interface/content text, completing the typography criterion (ADR-0014). Release APK/lint, debug build/lint, unit tests, Android test compilation, R8 shrinking, and baseline-profile collection pass. R8 9.5.23 overrides the AGP-bundled version so Kotlin 2.4 metadata is parsed during shrinking. On ALT-LX1 Android 14, generated baseline/startup profiles were benchmarked across five cold starts; `timeToInitialDisplayMs` median was 454.6 ms (range 428.9–622.4 ms). Isolated `.baselineprofile` variants preserve the production app installation (ADR-0015). Light, System (device-dark), 1.3 font-scale, and timeline/article/settings device visuals pass; status and navigation bar icon contrast follows the resolved app theme instead of the device mode. TalkBack focus traversal passes on Connect, timeline, scope tabs, article detail, and Settings, including selected-state feedback. A TalkBack pass on signed-in composer/manage screens remains outstanding because no signed-in account is active on the test installation.

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
| Publishing | `POST`, `PATCH`, and `DELETE /api/posts`; `GET /api/posts/drafts`, `GET /api/posts/mine`, `GET /api/posts/mine/counts`; HTML content is required; raw image upload is `POST /api/uploads` |

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
- R6 offline reading uses only the documented bounded cache of public post details; it does not provide offline feeds, comments, drafts, or synchronization.
- Remote profile routes return 404 when federation is disabled.
