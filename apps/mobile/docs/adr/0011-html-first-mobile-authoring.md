# ADR-0011: HTML-First Mobile Authoring

**Status:** Accepted

## Context

R5 needs authors to create, recover, publish, and manage posts from Android. The server requires sanitized HTML on every write (`POST` and `PATCH /api/posts`; `contentHtml` is the only required create field) and stores an opaque web-editor document (`contentJson`) as-is. There is no documented portable rich-text payload, and the roadmap records `contentJson` as opaque web-editor data with no delta-sync or offline-sync endpoint. The architecture forbids persisting opaque editor documents or server data without a confirmed requirement and retention strategy.

## Decision

HTML is the canonical mobile authoring format. The client builds the sanitized-HTML subset the reader already renders, sends it as `contentHtml`, and never sends `contentJson`; omitted on create it stores as `null`, and omitted alongside `contentHtml` on update it wipes to `null`, exactly like webhook-ingested posts. Metadata-only updates omit `contentHtml` so the stored body and its null document stay untouched, preserving the backend autosave-safety rule. Optional fields are omitted when untouched and cleared with empty values (`""` collapses to `null` for title, summary, language, and banner; `[]` clears tags), matching server normalization without requiring explicit-null encoding. No local draft store is introduced; recovery reads server drafts through `GET /api/posts/drafts` and `GET /api/posts/mine`.

## Consequences

- The mobile editor stays independent of web Tiptap internals and produces only constructs the native reader confirms.
- Posts created on mobile hydrate in the web composer through its stored-HTML fallback path.
- Clearing a banner, summary, or language uses empty values rather than explicit nulls.
- Offline composition and local draft caching stay out of scope until a retention, freshness, and eviction strategy is documented.
- Image uploads send raw bytes with an explicit image content type, following the confirmed `POST /api/uploads` contract.

## References

- R5 and API gaps in `roadmap.md`
- `../../../backend/src/routes/posts.ts`
- `../../../backend/src/services/posts.ts`
- `../../../backend/src/routes/media.ts`
- `../../../frontend/src/lib/editor/Editor.svelte`
- `../../../frontend/src/routes/compose/+page.svelte`
- ADR-0006
