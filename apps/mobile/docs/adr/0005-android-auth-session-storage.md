# ADR-0005: Android Auth Session Storage

**Status:** Accepted

## Context

Better Auth uses cookies to restore a session and mint a short-lived API JWT. Android must retain those credentials across restarts without sending them to another instance or persisting the JWT.

## Decision

Android persists Better Auth cookies encrypted with an Android Keystore AES key. Cookie records are partitioned by the normalized HTTPS instance origin and are exposed to Ktor only for requests to that exact origin. The session repository keeps the JWT and authenticated user in memory; restoring a session always mints a fresh JWT through `GET /api/auth/token`.

Type-safe Compose Navigation owns transitions between instance selection and authentication. Routes contain no credentials, session data, or serialized instance models.

## Consequences

- Restarting the application can restore a Better Auth session for the selected instance.
- Switching instances cannot reuse cookies or JWTs from the prior origin.
- Signing in, registration, and sign-out use the same cookie store when they are introduced.
- Android-only keystore and Ktor cookie integrations remain in `androidMain`; common code depends only on storage contracts.

## References

- R1 in `roadmap.md`
- `docs/architecture.md`
- `docs/adr/0004-jwt-api-authentication.md`
- `../../../backend/src/auth/auth.ts`
