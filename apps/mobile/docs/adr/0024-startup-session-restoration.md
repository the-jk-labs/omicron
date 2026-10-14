# ADR-0024: Startup Session Restoration

**Status:** Accepted

## Context

Instance recovery and authentication recovery are separate. Entering the timeline after recovering only public instance metadata makes a returning signed-in reader appear signed out until they open the authentication destination.

## Decision

A shared startup ViewModel resolves the saved instance and restores that origin's unexpired stored cookies through the existing authentication repository before creating the navigation host. A restored session mints a fresh in-memory JWT using the existing Better Auth endpoints. Readers without saved cookies skip network authentication checks.

With a saved instance, Home is the initial destination for both authenticated readers and guests; connection and session confirmation screens are not startup gates. Without a saved instance, connection remains the initial destination. Explicit instance changes navigate to connection and clear the prior navigation stack regardless of the initial destination.

During restoration, show a centered loading state rather than signed-out navigation. A transient failure retains credentials and offers retry, instance selection, and, when an instance is known, explicit guest reading so public offline articles remain reachable. Confirmed missing or unauthorized sessions use the existing credential-clearing behavior and open guest Home. Cancellation cannot become an error or guest transition.

## Consequences

- Authenticated feed and navigation first load with the restored user and freshly minted JWT.
- Guests with a saved instance can open Home without network-dependent authentication checks.
- Network failure is distinct from sign-out and does not silently discard a saved session.
- Navigation callbacks cannot assume the connection destination exists on the back stack.
- No backend contract, JWT persistence, or cross-origin credential behavior changes.

## References

- R1 in `roadmap.md`
- ADR-0004 and ADR-0005
- `../../../backend/src/auth/auth.ts`
- `../../../frontend/src/routes/+layout.server.ts`
