# ADR-0006: Reader Images And Article Rendering

**Status:** Accepted

## Context

R2 renders public posts natively: cover media, inline body images, and the sanitized `contentHtml` the server stores. The sanitizer allowlist (`backend/src/lib/sanitize.ts`) is the exact vocabulary the client must cover: text blocks, headings, emphasis, links, images, lists, quotes, code, tables, details, definition lists, figures, and KaTeX MathML. No WebView is introduced unless a documented construct makes it unavoidable.

## Decision

Coil 3 (`coil-compose` with the Ktor 3 network fetcher, sharing the app's HTTP stack) loads every remote image. Android registers the fetcher on the singleton image loader; common code uses `AsyncImage` with no platform branching. Coil owns the memory and disk caches with its defaults: covers and avatars persist across restarts, article images are evicted by the cache, and there is no separate offline image store.

Coil is pinned to 3.4.0, the newest release that still compiles against SDK 36: 3.5.0 raises the minimum SDK and 3.6.0 requires compile SDK 37 with AGP 9, past this project's AGP 8 ceiling. Revisit the pin when the project moves to SDK 37.

Article HTML is parsed in common code with Ksoup (WHATWG parsing, no platform branching) into an immutable block model (`core/article`) and rendered with native Compose text and layout. Supported natively: paragraphs, headings, emphasis and inline code, links, images, ordered and unordered lists, blockquotes, code blocks, horizontal rules, and simple tables. Anything outside that set (collapsible `details`, definition lists, figures with captions, KaTeX MathML, struck layout tags) renders as its plain text, so no author content is silently dropped.

## Consequences

- Post detail and timeline-adjacent surfaces can show covers, avatars, and body images without new image code per screen.
- A dead remote image hides itself instead of leaving a broken glyph, matching the web reader.
- Table styling, syntax highlighting, and math rendering stay plain until a later slice documents and implements them; the fallback text keeps them readable.
- `contentJson` (opaque web-editor data) is never parsed or stored; the HTML body is the only authoring artifact the client reads.

## References

- R2 in `roadmap.md`
- `docs/architecture.md` (networking: media resolves against the instance origin)
- `../../../backend/src/lib/sanitize.ts`
- `../../../frontend/src/routes/[handle]/[slug]/+page.svelte`
