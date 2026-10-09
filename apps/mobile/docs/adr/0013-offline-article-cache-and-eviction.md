# ADR-0013: Offline Article Cache And Eviction

**Status:** Accepted

## Context

R6 requires reading previously opened articles without a network connection and a documented eviction policy. The server provides no offline or delta-sync API. The mobile client must keep a bounded, instance-isolated copy of public article details without persisting private drafts, scheduled posts, or per-account social state.

## Decision

- Cache only successfully fetched `Published` post details. Never cache drafts, scheduled posts, feed pages, comments, or viewer-specific liked/recommended state.
- Key article records by instance origin and post ID. Keep them in app-private Android files.
- Try the server on every post-detail open. If a transport `IOException` occurs, use an unexpired local copy; HTTP errors such as 401 and 404 remain authoritative and do not fall back to cached content.
- Expire article records 30 days after their last successful network fetch. On reads, update access time for least-recently-used eviction.
- Bound the article cache to 50 records and 64 MiB total, evicting least recently used records until both limits hold. Skip a single record larger than the total limit.
- Keep downloaded images in Coil's independent app cache with a 32 MiB LRU limit. The operating system may clear image files at any time; article text remains independently cached.
- Provide an offline-reading list for the currently selected instance, with per-article removal and a clear-current-instance action. A cached article is identified as an offline copy; social actions, comments, and uncached media are unavailable offline.

## Consequences

- Previously opened public articles can be reopened from Settings while offline, subject to expiry and eviction.
- Switching instances does not mix article content. The total article and image limits are shared by the installation, so use across many instances competes for the same bounded space.
- Cached content can be stale for up to 30 days. Online requests always refresh it; deleted or unauthorized responses never resurrect a cached copy.
- The cache is not a publishing or draft-recovery mechanism, and no server data synchronization is implied.

## References

- R6 and API constraints in `roadmap.md`
- `../../../backend/src/routes/posts.ts`
- `../../../backend/src/services/posts.ts`
- `../../../frontend/src/routes/posts/manage/+page.svelte`
- Coil 3 image caching behavior
- ADR-0011
