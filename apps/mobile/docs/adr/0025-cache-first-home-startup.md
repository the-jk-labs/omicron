# ADR-0025: Cache-First Home Startup

**Status:** Accepted

## Context

Waiting for two authentication requests before opening Home prevents a returning reader from seeing already loaded content immediately. Reliable session recovery does not require blocking presentation on the network.

## Decision

Resolve the selected instance and an encrypted local Home snapshot before opening navigation. Restore authentication in the background through the existing Better Auth session and token endpoints. Cached account metadata is presentation only; only a newly confirmed session can authorize app requests. Requests wait for pending restoration, and cached feed mutations remain unavailable until the session and displayed feed have refreshed. Better Auth cookies are sent only to that origin's `/api/auth/*` endpoints; normal app routes use the in-memory Bearer token so a guest fallback cannot accidentally reuse cookie authentication.

Keep one latest Home snapshot, partitioned by its exact instance origin and account ID. Android stores it encrypted with a separate Keystore AES-GCM key in the app's no-backup directory. Persist account metadata and at most 30 card previews from the latest initial Home page, bounded to 1 MiB of serialized data. Retain display metadata, an excerpt, reading time, and read-only engagement state; omit article HTML. Do not persist JWTs, passwords, pagination cursors, drafts, schedules, comments, or editor JSON. Expire feed content after 24 hours and account metadata after 30 days. Account or instance changes cannot reuse the prior account's posts; sign-out and confirmed session loss clear the snapshot. Generation checks prevent late responses from restoring a cleared or switched cache.

Render cached cards with stable keys while refreshing. Background failures show inline retry feedback without hiding saved posts or pretending the cached account is authorized. Successful initial loads replace the snapshot; pagination is available only after a fresh response supplies its unchanged opaque cursor. Cached social state is read-only until refreshed; no offline mutation queue is introduced.

Confirmed forbidden reading responses discard saved cards instead of treating them as offline content. Account metadata remains presentation only while its session is valid. The independent public article library remains available when background session refresh is unavailable, but HTTP authorization failures do not fall back to cached article content.

The existing public article library and its retention policy remain separate. This decision supersedes ADR-0024's network-blocking startup gate and ADR-0013's feed exclusion only for this bounded encrypted Home snapshot.

## Consequences

- A warmed installation can open Home and saved posts without waiting for the server.
- A first launch or an installation without a snapshot still needs network data for its first feed.
- Cached identity never creates an authenticated session or bypasses server authorization.
- Cached posts may be stale until refresh succeeds, and private account data is never reused by a different account or origin.
- USB phone journeys must cover delayed authentication, cached content, failures, sign-out, account isolation, and real cold restarts.

## References

- R1 and R6 in `roadmap.md`
- ADR-0004, ADR-0005, ADR-0013, and ADR-0024
- `../../../backend/src/auth/auth.ts`
- `../../../backend/src/routes/feed.ts`
- `../../../frontend/src/routes/+layout.server.ts`
