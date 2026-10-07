# ADR-0007: Best-Effort Mobile Sign-Out

**Status:** Accepted

## Context

The mobile client stores Better Auth cookies per instance origin and keeps its JWT in memory. If the sign-out request fails because the network or server is unavailable, retaining device credentials prevents the user from leaving the account or switching accounts.

## Decision

Sign-out attempts remote Better Auth revocation, then always clears the in-memory session and that origin's persisted cookies. If remote revocation cannot be confirmed, the app still returns to the sign-in form and explains that the remote session may remain active.

## Consequences

- A user can leave the account on this device and switch accounts while offline.
- The remote Better Auth session may remain active until it expires if the server could not confirm revocation.
- Cookie cleanup is origin-scoped and does not remove another instance's credentials.

## References

- R1 in `roadmap.md`
- `docs/architecture.md`
- `docs/adr/0005-android-auth-session-storage.md`
- `../../../backend/src/auth/auth.ts`
