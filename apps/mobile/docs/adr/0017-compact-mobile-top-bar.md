# ADR-0017: Compact Mobile Top Bar

**Status:** Accepted

## Context

The responsive web navigation includes a theme toggle, but the Android client already provides persistent System/Light/Dark choices in Settings (ADR-0012). On narrow phones, the extra top-bar action competes with the operator-selected instance name for limited horizontal space.

## Decision

- Keep search, notifications, and account actions in the mobile top bar; appearance choices are available only in Settings.
- Use a 56dp top bar with 48dp minimum action targets. Let the instance name occupy the remaining width and truncate only when it cannot fit.
- This supersedes the appearance action in the top-bar decision recorded by ADR-0016; all other responsive navigation decisions remain in effect.

## Consequences

- The mobile header has consistent action alignment and gives the instance identity more room on narrow screens.
- Appearance remains persistent and accessible through Settings, without changing its storage or System/Light/Dark behavior.
- The Android top bar intentionally omits the web theme toggle to preserve the native mobile layout.

## References

- Roadmap R6: Settings And Release Readiness; R7: Native Mobile Web Parity.
- ADR-0012: Mobile Settings And Appearance.
- ADR-0016: Responsive Web Navigation Parity.
- `composeApp/src/commonMain/kotlin/org/omicron/mobile/feature/navigation/MobileAppChrome.kt`.
