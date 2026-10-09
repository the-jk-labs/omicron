# ADR-0012: Mobile Settings And Appearance

**Status:** Accepted

## Context

R6 adds mobile settings for the selected instance, appearance, app information, and sign-out. The web client offers System, Light, and Dark appearance choices and persists the preference locally. Android needs to apply one theme across routes and retain the choice across restarts and instance changes without adding an unconfirmed server setting.

## Decision

- Open Settings from the timeline header and keep instance switching in the existing connection flow.
- Store the appearance preference in app-private Android preferences, independent of the selected instance and authenticated account.
- Support System, Light, and Dark. Default to System; while selected, resolve the theme from Android's current appearance.
- Keep the preference model and storage contract in common code, with the SharedPreferences implementation in `androidMain`.
- Sign-out continues to use the existing authenticated session repository, which clears local credentials even when server revocation fails.

## Consequences

- The theme choice survives app restarts and instance changes but is not synchronized with the web client or another device.
- Clearing the app's local data resets the preference to System.
- Settings remain available while signed out so appearance, About, and instance selection remain accessible.

## References

- R6 in `roadmap.md`
- `../../../frontend/src/lib/theme.svelte.ts`
- `../../../frontend/src/routes/settings/+page.svelte`
- `composeApp/src/commonMain/kotlin/org/omicron/mobile/core/designsystem/OmicronTheme.kt`
- `composeApp/src/androidMain/kotlin/org/omicron/mobile/core/storage/SharedPreferencesAppearancePreferenceStore.kt`
