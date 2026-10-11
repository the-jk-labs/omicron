# ADR-0019: Mobile Composer Presentation

**Status:** Accepted

## Context

The R5 block editor places optional metadata and cover controls ahead of writing, while save, publish, and insertion actions scroll away. A narrow phone needs a clear writing hierarchy and reachable controls when the keyboard is open. The web composer provides Lucide tools and a separate Publishing options menu.

## Decision

Keep the HTML-first block model from ADR-0011. Present title and full-width body fields as the primary writing surface. Optional cover, summary, tags, and language live in an expandable Post details section. Save and Publish remain above the scrolling document, with scheduling in Publishing options. A horizontally scrollable Lucide icon-and-label toolbar remains below the document and above the keyboard. Newly inserted editable blocks scroll into view and receive focus. Block removal lives in a labeled block menu.

Use existing Omicron tokens, RikkaUI textarea and collapsible primitives, resource-backed labels, and at least 48dp touch targets. Preserve server-draft autosave, opaque HTML passthrough, image upload recovery, and published/scheduled post behavior.

Android uses resize-mode keyboard handling with Compose IME insets. The writing screen hides the primary bottom navigation while the keyboard is visible so the insertion toolbar sits directly above it.

## Consequences

- Authors can start writing without navigating optional fields and can insert blocks without scrolling to the end of a post.
- Expanded metadata retains its values when collapsed; expansion is presentation state only.
- Toolbar actions insert supported blocks, rather than offering inline formatting the native block model does not implement.
- Keyboard, font scaling, narrow-screen, and assistive-technology behavior require focused device coverage.

## References

- R5 and R6 in `../../roadmap.md`
- ADR-0011
- `../../../frontend/src/routes/compose/+page.svelte`
- `../../../frontend/src/lib/editor/Editor.svelte`
- `../../../backend/src/routes/posts.ts`
