# ADR-0022: Connection Relationship Preloading

**Status:** Accepted

## Context

Visibility-triggered profile reads leave off-screen connection rows unresolved even after a reader spends time on the screen. Fast scrolling then reveals Checking actions while those rows begin their first relationship requests. Member summaries do not include viewer follow state, and no bulk relationship endpoint is confirmed.

The local and remote following-list queries return only approved edges. When the list belongs to the signed-in viewer, membership already confirms Following and individual relationship reads are redundant.

## Decision

When the signed-in viewer's own Following list loads, seed unresolved rows as Following in the same state update that exposes the list. Cancel active or queued relationship checks for those rows. Seeding does not adjust the header count, which already includes those approved relationships, or replace resolved and locally mutated state. Reuse the resulting state across both tabs. Guests and self rows receive no relationship state from membership.

For remaining previously unchecked members of either loaded tab, enqueue checks through the existing local and remote profile endpoints. Use the existing four-request semaphore and keep the list visible while checks finish. Load the other tab only when selected. Membership in someone else's list does not establish the viewer's relationship, and absence from the viewer's own list does not exclude a pending request.

The destination ViewModel owns scheduling and retention. Composing or scrolling a row does not start a check. Resolved relationships and failed-check retry states remain in memory for the destination and current session identity. Failed checks require an explicit row retry. Session identity changes cancel queued and active checks, clear relationship state, and reload accessible members; closing the destination cancels all pending work.

This supersedes only the visibility-triggered loading decision in ADR-0021. Follow mutations, confirmation, owner count updates, guest and self-row behavior, and credential boundaries remain unchanged.

Own-list membership does not provide private-account metadata. Follow mutations use that metadata when already known and otherwise use the existing mutation response as authoritative for Requested or Following.

## Consequences

The viewer's own Following rows are ready with the list response and need no per-person profile reads. Other off-screen actions become ready while the screen remains open, and scrolling does not restart successful or failed checks. Checking still represents an unfinished initial request. Lists with unresolved viewer relationships perform more profile reads than visibility-only loading, bounded to four concurrent requests; a general bulk relationship API remains an API gap. No relationship state is persisted, and no additional endpoints or dependencies are introduced.

## References

- Roadmap R3 social recovery, R7 connection-row scrolling reliability, and member-summary API constraint.
- `apps/backend/src/routes/users.ts`, `remote.ts`, `services/follows.ts`, and `db/repositories/follows.ts`.
- ADR-0020: Profile Connections Navigation; ADR-0021: Connection-Row Follow Controls.
