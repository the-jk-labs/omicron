# Architecture

## Product Boundary

Omicron for Android is an Android-first Kotlin Multiplatform client. `commonMain` owns product behavior and models. `androidMain` owns Android framework entry points, networking engines, secure storage integrations, and other platform bindings. Android remains the only target until the roadmap explicitly changes that decision.

## Package Direction

Dependencies point toward the center of the application:

```text
feature -> domain <- data -> core
                 ^
                 androidMain integration
```

- `core`: design system, network configuration, storage contracts, and shared utilities. It must not depend on product features.
- `data`: API DTOs, Ktor clients, local stores, caches, and repository implementations. It maps transport and storage details into immutable domain models.
- `domain`: immutable models and use cases that remove real duplication. It must not depend on Android or Compose.
- `feature.<name>`: route, screen, ViewModel, state, events, and feature-specific UI. Features depend on repositories or use cases, never on another feature's internal state.
- `androidMain`: composition root, Ktor engine, Android storage, intents, Custom Tabs, and other Android-only code.

Keep the package layout stable inside the single `composeApp` module. Split Gradle modules only when build time, ownership, or dependency isolation makes the boundary valuable.

## State And UI

- Screens expose immutable `StateFlow` state and accept events. Side effects run in the ViewModel or repository, not in composables.
- Model loading, content, empty, error, offline, retry, and mutation-in-progress states explicitly.
- Use type-safe Compose Navigation when more than one route is present. Navigation arguments are identifiers, not serialized models or mutable state.
- Use stable keys and content types for every lazy-list item.
- Use `OmicronTheme`, RikkaUI, and Lucide RikkaIcons. Do not introduce Material3 or ad-hoc visual tokens.
- All visible strings live in common Compose resources. Design for light and dark modes, 48dp touch targets, edge-to-edge drawing, and font scaling.

## Networking

- Ktor clients are configured by the Android composition root and used through data-layer APIs.
- The normal Omicron API is rooted at `/api`; Better Auth owns `/api/auth/*`.
- Accept only HTTPS instance origins. Do not follow cross-origin redirects for instance bootstrap or authenticated calls.
- DTOs mirror confirmed wire contracts and tolerate additive fields only where safe. Repositories map DTOs before exposing data to features.
- Treat cursors as opaque values. Preserve `nextCursor` unchanged and never derive offsets.
- Resolve root-relative media against the selected instance origin.

## Storage And Authentication

- Instance configuration is public metadata and may be persisted after a successful metadata request.
- Session cookies are credentials. The auth release must store them securely, partition them by instance origin, and use them only with Better Auth to restore a session or mint a new token.
- Sign-out clears the in-memory JWT and that origin's stored cookies even when remote revocation fails; the UI warns when the server could not confirm sign-out.
- Authenticated API calls use a short-lived JWT in the `Authorization: Bearer` header. Keep it in memory, refresh it through `GET /api/auth/token` before expiry, and never send it to another origin.
- Cache ownership, freshness, eviction, and offline behavior must be documented with the release that introduces a cache.
- Never persist passwords, opaque editor documents, or server data without a confirmed product requirement and retention strategy.

## Testing

- Repository and API behavior use fixtures and Ktor `MockEngine` tests.
- ViewModels test state transitions with fake repositories and controlled coroutines.
- Critical journeys add Compose UI tests when the corresponding routes exist.
- Every implementation change runs the relevant Gradle build, lint, and test tasks locally; CI runs the baseline Android quality gate for pull requests.

## Decisions

Architecture decisions with lasting consequences belong in `docs/adr/`. An ADR records context, decision, consequences, and supersession without becoming a changelog.
