# ADR-0021: Connection-Row Follow Controls

**Status:** Accepted

## Context

The dedicated followers/following screen needs direct follow controls. Its member summaries contain identity fields only, so membership in another account's list does not establish whether the current viewer follows an actor. Local private accounts also distinguish approved follows from pending requests.

## Decision

Resolve the signed-in viewer's relationship through existing local or remote profile reads when a row becomes visible, with at most four concurrent checks. Hold the resulting Follow/Following/Requested state in memory per actor handle and session identity, shared across both list tabs. Failed checks expose retry instead of guessing the relationship. Guests receive a Follow action leading to sign-in, and the viewer's own row has no action.

Serialize connections state transitions on the Compose main dispatcher while API calls remain suspending. Keep request jobs scoped to the destination and cancel them when session identity changes or the destination closes.

Use existing follow mutation routes. Follow starts immediately with optimistic state, using private-account metadata to show Requested and the server response as authoritative. Following and Requested open a RikkaUI alert dialog; only its explicit Unfollow or Cancel request action sends the removal request. Cancel or system back closes the confirmation without changing the relationship. Busy actions prevent duplicate requests, and failures roll back state with visible retry feedback.

When viewing the signed-in user's own connections, approved follow changes adjust the Following count. Successful unfollows remove the actor from the owner's cached Following list; new follows invalidate that list so the next load preserves server order. Mutations on someone else's profile do not change that profile's counts or member lists. Session identity changes cancel checks and mutations and clear pending confirmation and relationship state.

## Consequences

This extends R3 social interactions within the R7 connections presentation. The existing API adds per-visible-row profile reads; no enriched member fields, bulk endpoint, mobile-specific server contract, or persistent relationship cache is introduced. Remote profiles retain the server's two-state follow model. Messaging and follower removal remain separate capabilities.

## References

- Roadmap R3 social interactions, R7 connection-row controls, and member-summary API constraint.
- `apps/backend/src/routes/users.ts`, `remote.ts`, and `serializers.ts`.
- `apps/frontend/src/lib/components/FollowButton.svelte` and `apps/frontend/src/lib/api/index.ts`.
- ADR-0010: Mobile Social Actions And Profiles; ADR-0020: Profile Connections Navigation.
