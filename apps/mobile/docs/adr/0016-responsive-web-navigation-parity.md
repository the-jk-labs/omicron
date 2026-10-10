# ADR-0016: Responsive Web Navigation Parity

**Status:** Accepted

## Context

The mobile web client exposes a compact top bar and signed-in bottom navigation for Home, Lists, Write, Stats, and Profile. The Android client has native versions of several destinations, but its top-level navigation and Home feed hierarchy do not match the responsive web experience. Lists, writer analytics, and notifications also have confirmed shared API contracts but no Android screens yet.

## Decision

- Keep the Android client fully native Compose and use the responsive web client as the visual and information-architecture reference.
- Use a persistent signed-in mobile shell with Home, Lists, Write, Stats, and Profile destinations, plus a top bar for search, appearance, notifications, and the account menu.
- Keep secondary destinations such as Discover, Settings, and post management reachable from the top bar/account menu.
- Implement Lists, Stats, and Notifications only against their existing shared `/api` contracts; preserve opaque cursors and the existing origin-scoped Bearer authentication behavior.
- Keep tokens, typography, radii, and shadows in `OmicronTheme`, and keep accessible selected states and 48dp touch targets.

## Consequences

- The Android navigation model gains top-level destinations and must preserve each destination's expected back-stack and sign-in behavior.
- Lists, dashboard, and notifications require common API, repository, ViewModel, and UI coverage.
- Native screens will follow the web's layout and visual hierarchy without embedding the web client or adding mobile-specific backend routes.
- R6 accessibility and release gates remain independently required before release.

## References

- Roadmap R7: Native Mobile Web Parity.
- `../../roadmap.md` confirmed API inventory.
- `../../../frontend/src/lib/components/Nav.svelte`, `MobileNav.svelte`, `PostCard.svelte`, and `../../../frontend/src/routes/+page.svelte`.
- `../../../backend/src/routes/lists.ts`, `dashboard.ts`, and `notifications.ts`.
