# ADR-0023: Social Mutation Transport And Recovery

**Status:** Accepted

## Context

The public instance routes `/api` through SvelteKit before forwarding requests to the backend. Its origin check rejects bodyless social POSTs without a same-origin `Origin` header, even when they carry a valid Bearer token. Reader actions also run independently, so rolling back an entire post or comment can overwrite another successful mutation.

## Decision

- Social API requests declare the destination's normalized origin, including non-default ports. Bearer authentication and origin-partitioned cookie storage continue to follow ADR-0004 and ADR-0005.
- Each optimistic mutation confirms or rolls back only the fields it owns. Errors belong to the failed action or comment, with separate offline, expired-session, forbidden, and request feedback.
- A failed response retains its original draft and reply target. Draft and target controls stay locked while sending, and unconfirmed comments expose no mutation actions.
- Retries repeat the failed action; destructive comment retries still require confirmation. Comment pagination preserves opaque cursors and unique thread identifiers.
- Comment actions wrap at narrow widths and larger font scales. Reply opens and focuses the response composer; comment-like controls expose their selection and count to accessibility services.

## Consequences

- Social writes work through the existing public gateway without changing its browser protections or adding API fields.
- Independent likes, recommendations, and edits cannot erase one another during rollback.
- Pending comments stay visible as posting feedback but cannot be submitted as server identifiers.
- State remains destination-local and in memory, as specified by ADR-0010.

## References

- R3 in `roadmap.md`
- ADR-0004 and ADR-0010
- `../../../frontend/src/routes/api/[...path]/+server.ts`
- `../../../frontend/src/lib/components/Comments.svelte`
- `../../../frontend/src/lib/components/CommentNode.svelte`
- `../../../backend/src/routes/posts.ts`
- `../../../backend/src/services/comments.ts`
