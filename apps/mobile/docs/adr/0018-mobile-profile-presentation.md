# ADR-0018: Mobile Profile Presentation

**Status:** Accepted

## Context

The web mobile profile separates its avatar and primary action from full-width identity text. The native profile places identity beside the avatar and exposes follow, mute, and block in one row, constraining names and actions on narrow screens. Its plain-text About links and article counts lack the web's visual hierarchy.

## Decision

Use the web mobile header structure with a 72dp avatar, a primary follow or owner-management action, and full-width name, handle, biography, interests, and follower counts below. Move mute and block into a labelled More actions menu beside follow; keep the existing account menu separate. Preserve all existing profile sections and restrictions with scrollable underline tabs that expose selected-state semantics.

Use RikkaUI avatar, badge, tabs, dropdown-menu, separator, and card primitives with Omicron tokens. Profile articles retain their existing read-only interactions and gain compact media previews and labelled metadata. About links open through Compose's platform URI handler, with visible failure feedback, and remain constrained to the existing server-provided profile fields.

## Consequences

Long identity text and large font scales have the full content width. Relationship actions remain reachable without crowding the header. Native owner management remains available because mobile Settings does not yet edit profiles. Profile editing, lists, extended About fields, RSS, and address copying remain planned parity work.

## References

- Roadmap R7 profile refinement and R3 profile contracts.
- `apps/frontend/src/routes/[handle]/+page.svelte`.
- `apps/frontend/src/lib/components/ProfileMenu.svelte` and `ProfileLinksCard.svelte`.
- ADR-0010: Mobile Social Actions And Profiles.
