# ADR-0014: Bundle Inter And Source Sans 3

**Status:** Accepted

## Context

The web client self-hosts Inter for its interface and Source Sans 3 for rendered article content. Android previously used the system sans-serif for both, so font metrics and reading typography varied by device and diverged from the web design tokens. R6 requires typography parity without a third-party runtime font request.

## Decision

- Bundle the full-Unicode variable TTF files for Inter and Source Sans 3 in common Compose resources, together with the SIL Open Font License 1.1 notices.
- Use Inter for RikkaUI interface typography and Source Sans 3 for rendered article text, profile biography text, and composer body blocks. Keep code in the existing monospace family and Source Sans 3 italics in italic spans.
- Source files from the Google Fonts export at Inter commit `e1d6480102fed30739fead0faee463101f892c8f` and Source Sans 3 commit `4591e3457ab8be6d70167aa6818922b91e78ab2d`; the web dependencies are `@fontsource-variable/inter` 5.3.0 and `@fontsource-variable/source-sans-3` 5.3.0.

## Consequences

- Fonts load locally at startup and remain available offline; dynamic font scaling is still handled by Compose.
- The three TTF assets add about 1.8 MiB before APK compression. License notices ship in the app resources.
- Font updates must remain aligned with the web client's typeface families and retain their OFL notices.

## References

- R6 in `roadmap.md`
- `../../../frontend/src/app.css`
- `../../../frontend/package.json`
- Google Fonts Inter and Source Sans 3 OFL 1.1 distributions
- `composeApp/src/commonMain/kotlin/org/omicron/mobile/core/designsystem/OmicronTheme.kt`
