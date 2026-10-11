# ADR-0020: Profile Connections Navigation

**Status:** Accepted

## Context

The native profile duplicates Followers and Following as header counts and content tabs. The web opens member lists from the counts, while a separate native people screen gives the lists room without displacing profile articles, recommendations, or About content.

## Decision

Keep Followers and Following only as profile-header counts. For unlocked local profiles, tapping a count navigates to a type-safe destination containing the username and the initial list choice. The people screen shows back navigation, the username, counted Followers/Following tabs, and avatar rows that open local or supported remote profiles.

Give the destination its own ViewModel and independent in-memory state for each list. Retrieve profile metadata for current counts and access restrictions; load only the selected list on demand using the existing unpaginated `/api/users/:username/followers` and `/following` endpoints. Preserve server order. Save the selected tab and each list's scroll position with the navigation entry so returning from a member profile restores the prior list choice while reloading current data. Session identity changes clear and reload the destination state so private member lists are revalidated.

Locked private and remote profiles keep read-only counts. Use existing RikkaUI primitives and Omicron tokens, with selected-state semantics, 48dp touch targets, and loading, empty, offline, error, and retry states.

## Consequences

Profile content tabs contain Articles, Recommendations when available, and About. Connection-list requests no longer belong to the profile ViewModel. No pagination, sorting, messaging, subscription, or relationship-management capabilities are introduced by this presentation change.

## References

- Roadmap R7 profile connections refinement and R3 profile contracts.
- `apps/frontend/src/routes/[handle]/+page.svelte` and `apps/frontend/src/lib/components/FollowListDialog.svelte`.
- `apps/backend/src/routes/users.ts` and `apps/backend/src/services/follows.ts`.
- ADR-0018: Mobile Profile Presentation; this decision replaces its use of profile content tabs for member lists.
