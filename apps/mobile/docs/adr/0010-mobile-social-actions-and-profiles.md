# ADR-0010: Mobile Social Actions And Profiles

**Status:** Accepted

## Context

R3 adds authenticated interactions and profile navigation to the native reader. The web client already uses the shared `/api` routes for post engagement, comments, reading lists, profiles, follows, mutes, and blocks. Better Auth JWTs are scoped to the selected instance origin and remain in memory.

## Decision

- Use the confirmed shared API routes through a social repository; do not add mobile-specific server routes or transports.
- Use a type-safe profile route whose argument is a username or remote `user@host` handle. Fetch the profile and its surfaces by identifier instead of passing mutable profile data through navigation.
- Apply optimistic interaction state in the feature ViewModel, use the server response as authoritative on success, and roll back the affected state with a visible error on failure.
- Use the server's per-account Read later list for the mobile save action.
- Treat an invalid session as signed out, show an explicit sign-in action, and return to the reading surface after authentication. Track server/token expiry separately from intentional sign-out so only expiry shows recovery messaging.
- Match the confirmed profile surfaces: local profiles expose their non-paginated follower/following member lists; remote profiles expose the follower/following counts provided by the API.

## Consequences

- Profile, post, comment, and relation state is held in memory and refreshed from the selected instance; no mobile-only cache is introduced.
- Pagination cursors remain opaque and are passed back unchanged.
- Remote follower/following member lists are not shown because the shared API and web profile expose counts only.
- A private local profile can show its public header but hides posts and member lists until the viewer is an approved follower.

## References

- R3 in `roadmap.md`
- `../../../backend/src/routes/posts.ts`
- `../../../backend/src/routes/users.ts`
- `../../../backend/src/routes/remote.ts`
- `../../../backend/src/routes/lists.ts`
- `../../../frontend/src/routes/[handle]/+page.svelte`
- `../../../frontend/src/lib/api/index.ts`
- ADR-0004
