# Known bugs (found while adding test coverage)

Every bug below is pinned by an **expected-fail test** (`test.fails(...)`, name
prefixed `BUG:`). The suite passes while the bug exists; once the bug is fixed
the test starts *failing* with "Expect test to fail". That is the signal to
turn `test.fails` into a plain `test` and delete the entry here.

Find them all with:

```sh
grep -rn "BUG:" apps/backend/tests apps/frontend/tests
```

Paths are relative to `apps/backend/` unless noted. Severity is a rough guide:
**High** = security / privacy / data integrity, **Medium** = wrong behaviour a
user or operator will hit, **Low** = edge case or cosmetic.

---

## Input handling and robustness

### B11. `htmlToText` throws on out-of-range numeric entities — Medium
- **Where:** `src/lib/html.ts` line 23.
- **Symptom:** a remote actor bio or Note containing `&#99999999;` or
  `&#x110000;` makes `htmlToText` throw `RangeError`. It runs on federated
  input (actor names and bios, Note content, notification snippets).
- **Root cause:** `Number.isFinite` doesn't bound the code point;
  `String.fromCodePoint` throws above `0x10FFFF`.
- **Fix idea:** check `code <= 0x10FFFF` (and arguably reject surrogates and 0).
- **Tests:** `tests/lib/html_test.ts` (two `BUG:` tests).

### B12. Setting the domain with its scheme breaks every absolute URL — Medium
- **Where:** `src/services/instanceSetup.ts` `getOrigin` (line 67); the input
  isn't validated at `src/routes/admin.ts` line 154 or `src/routes/setup.ts`
  line 61 (`z.string().trim().max(253)`).
- **Symptom:** an admin who types `https://blog.example.com` as the domain gets
  `https://https://blog.example.com` as the origin. Email links break, and so
  does the federation origin seeded from it at boot.
- **Fix idea:** normalize to a bare host on write (and/or in `getAppDomain`), or
  validate the shape in the route schemas.
- **Test:** `tests/services/instanceSetup_test.ts` ("a domain saved with a scheme does not double the scheme").

### B13. Instance name with RFC 5322 specials corrupts the From header — Medium
- **Where:** `src/services/emailSettings.ts` `defaultFrom` (line 89).
- **Symptom:** the derived From is `` `${name} <noreply@domain>` `` with the
  admin-chosen name unquoted. `Ada, Inc.` reads as two addresses, and with
  `Ada <3 Blog`, `extractAddress` picks the wrong envelope sender.
- **Fix idea:** quote the display name (escape `"` and `\`) when it contains specials.
- **Test:** `tests/services/emailSettings_test.ts` ("quotes an instance name that contains RFC 5322 specials").

### B14. Non-ASCII email subjects are written raw — Low
- **Where:** `src/lib/mime.ts` line 85.
- **Symptom:** subjects embed the instance name (`Your ${appName} …`). A
  non-ASCII name is written into the `Subject:` header as raw UTF-8 instead of
  an RFC 2047 encoded-word, so the header is invalid without SMTPUTF8. That
  contradicts the module's own pure-ASCII goal.
- **Test:** `tests/lib/mime_test.ts` ("encodes a non-ASCII subject so the header stays ASCII").

### B15. A blank `REDIS_URL` aborts the boot — Low
- **Where:** `src/config.ts` line 150 (`z.string().url().optional()`).
- **Symptom:** `docker-compose.yml` says `REDIS_URL` can be "blanked out" to run
  without Redis, but an empty value fails URL validation and the process exits.
- **Fix idea:** treat a blank value as unset (`?.trim() || undefined`), as
  `WEBHOOK_SECRET` already does.
- **Test:** `tests/config_test.ts` ("a blank REDIS_URL is treated as unset").

### B16. `POSTGRES_USER` isn't URL-encoded — Low
- **Where:** `src/config.ts` line 117.
- **Symptom:** the assembled `DATABASE_URL` encodes the password but not the
  user name. A `:` in `POSTGRES_USER` shifts the user/password split.
- **Test:** `tests/config_test.ts` ("percent-encodes a POSTGRES_USER containing a colon").

### B17. Bio length is checked before trimming — Low
- **Where:** `src/services/users.ts` line 83.
- **Symptom:** a bio that is 500 characters or fewer once trimmed, but over 500
  with a trailing newline, is refused. Every other field trims first.
- **Test:** `tests/services/users_test.ts` ("measures the bio limit after trimming").

### B18. Notification snippet can split an emoji — Low
- **Where:** `src/routes/serializers.ts` line 347 (`.slice(0, 140)`).
- **Symptom:** the comment snippet in the bell is cut by UTF-16 code units, so
  it can end in a lone surrogate, which renders as `�`.
- **Fix idea:** slice by code points (`[...text].slice(0, 140).join("")`).
- **Test:** `tests/routes/serializers_test.ts` ("notificationView never cuts the comment snippet inside a surrogate pair").

### B19. Legacy-Markdown backfill isn't idempotent, and has false positives — Low
- **Where:** `src/lib/legacyMarkdown.ts` (`upgradeLegacyMarkdown`, line 18;
  `ORDERED`, line 15). Only used by `scripts/backfill_markdown.ts`.
- **Symptom:**
  1. A quoted line that starts with a list marker (`> - item`) is rewritten
     again on a second run, despite the "safe to run repeatedly" promise.
  2. A real paragraph that starts with `<number>. `, such as an escaped
     Markdown `1984\. That year`, is turned into an ordered list.
- **Tests:** `tests/lib/legacyMarkdown_test.ts` (two `BUG:` tests).

### B20. A `mailto:` profile link becomes a credentialed https URL — Low
- **Where:** backend `src/lib/profileLinks.ts` `normalizeLinkUrl` (line 100), and
  its frontend twin `apps/frontend/src/lib/profileLinks.ts` `normalizeWebUrl`,
  which the profile editor uses before saving.
- **Symptom:** `mailto:me@example.com` is accepted and stored as
  `https://mailto:me@example.com/`, an https URL with credentials pointing at
  the mail domain.
- **Fix idea:** refuse input that already carries a non-http scheme, and any
  URL with a username or password, in both copies.
- **Test:** backend `tests/lib/profileLinks_test.ts` ("rejects a mailto: address …"),
  frontend `tests/lib/profileLinks.test.ts` ("a mailto address typed as a website is refused").

## Email

### B21. Email HTML templates don't escape interpolated values — Medium
- **Where:** `src/services/email.ts` `layout()` and every template that feeds it
  (e.g. `accountPostRemovedEmail`, `accountEmailChangedEmail`).
- **Symptom:** values are dropped into the HTML body raw. The post title in the
  "post removed" notice is author-written, so `a <b> & c` corrupts the message
  and `<a href="…">Restore</a>` injects live markup into a mail the instance
  sends under its own name. `appName`, `username` and `newEmail` go in the
  same way.
- **Fix idea:** HTML-escape every interpolated value (`escapeHtml` in
  `src/lib/html.ts`), including inside the `href`.
- **Test:** `tests/services/email_test.ts` ("escapes the post title in the HTML of the removal notice").

### B22. Password-reset and verification emails hardcode "Omicron" — Low
- **Where:** `src/services/email.ts` `sendPasswordReset` / `sendEmailVerification`.
- **Symptom:** every account notice uses the instance name (`Your ${appName} …`),
  but the two emails a new or locked-out user most needs say "Reset your Omicron
  password" / "Welcome to Omicron!", whatever the instance is called.
- **Test:** `tests/services/email_test.ts` ("the password-reset email names the instance, not the software").

### B23. SMTP AUTH fails for non-Latin-1 credentials — Medium
- **Where:** `src/lib/smtp.ts` (`AUTH LOGIN` uses `btoa(opts.username)` / `btoa(opts.password)`).
- **Symptom:** `btoa` only accepts Latin-1, so an SMTP password with any other
  character (Azerbaijani `ə`, `ş`, an emoji…) throws `InvalidCharacterError` and
  no mail can be sent. Latin-1 characters that do get through are encoded as
  Latin-1, not UTF-8.
- **Fix idea:** base64 the UTF-8 bytes (`TextEncoder` and then base64).
- **Test:** `tests/lib/smtp_test.ts` ("authenticates with a non-Latin-1 password", runs where openssl is available).

## Content webhook

All three are in `src/services/webhooks.ts` `ingestContent`; tests in
`tests/services/webhooks_test.ts`.

### B24. Too many tags are rejected only after the post is written — Medium
- **Symptom:** the payload schema allows up to 50 tags (`src/lib/webhook.ts`),
  but `resolveTags` caps a post at 5 and runs after `postsRepo.update` /
  `upsertByExternalId`. A delivery with a new body and six tags answers **400**,
  and the body is already saved (or the post already created).
- **Fix idea:** call `resolveTags(payload.tags)` before the write.
- **Test:** "too many tags are refused before the post is written".

### B25. Changing the status of an editor-scheduled post fails with a 500 — Medium
- **Symptom:** a post scheduled in the editor has `publish_at` set. When the CMS
  then sends `status: "draft"` or `"published"` for it, `ingestContent` changes
  the status but leaves `publish_at`, which violates the
  `posts_publish_at_status_ck` constraint, so the delivery fails with 500.
- **Fix idea:** clear `publishAt` whenever the status written is not
  `scheduled`, as `posts.updatePost` does via `resolvePublishAt`.
- **Test:** "changing the status of a scheduled post clears its publish time".

### B26. Webhook-published posts are never submitted to IndexNow — Low
- **Symptom:** `posts.createPost` / `updatePost` queue `indexnow_submit` on
  publish and on edit; `ingestContent` says it mirrors them but never does.
- **Test:** "a published ingest is submitted to IndexNow like an editor publish".

## Wizard-configured domain ignored

### B27. IndexNow never submits on a wizard-configured instance — Medium
- **Where:** `src/services/indexNow.ts` `origin()`.
- **Symptom:** the public origin comes from the boot-time `config.APP_DOMAIN`,
  not the domain saved by the setup wizard (`getAppDomain()`). An instance set
  up through the wizard keeps `APP_DOMAIN` at its `localhost:5173` default, so
  `origin()` returns null and IndexNow silently does nothing, even when switched
  on. (`moderation.blockDomain` already reads `getAppDomain()`.)
- **Test:** `tests/services/indexNow_test.ts` ("submits on an instance whose domain was set in the setup wizard").

## Stock photos

### B28. Openverse source keys are shown raw in published credits — Low
- **Where:** `src/services/openverse.ts` `toPhoto` (`source.charAt(0).toUpperCase() + …`).
- **Symptom:** Openverse source keys are snake_case (`wikimedia_commons`), so
  the credit line under a published banner reads "Wikimedia_commons".
- **Test:** `tests/services/openverse_test.ts` ("a multi-word source key reads as words in the credit line").

## Image caches

### B29. An uncreatable cache directory turns a share image into a 500 — Low
- **Where:** `src/services/ogCard.ts` `postCard`, `src/services/profileCard.ts`
  `profileCard`, `src/services/shareImage.ts` `shareJpeg`. Each calls `mkdir`
  for its cache directory outside the `try` that makes cache writes best-effort.
- **Symptom:** if the uploads volume can't take the directory (read-only, full,
  a stray file in the way), a card that rendered fine is thrown away and the
  request fails, contradicting each function's own "a failed cache write … must
  not cost the caller" comment.
- **Fix idea:** move the `mkdir` inside the `try`.
- **Tests:** "a cache directory that cannot be created still returns the card/image"
  in `tests/services/{ogCard,profileCard,shareImage}_test.ts`.

## Profiles of deleted accounts

### B30. A deleted account's recommendations tab keeps listing its boosts — Low
- **Where:** `src/routes/users.ts`, `GET /api/users/:username/posts` and
  `/recommendations`. Both look the user up with `usersRepo.findByUsername` and
  never check `deletedAt`; `recommendationsRepo.listByUser` filters on the *post
  author's* suspension and deletion, never on the recommender's.
- **Symptom:** every other profile surface treats a deleted account as not found
  (`follows.profile`, `followersOf`, `followingOf`). Checked end to end: the posts
  tab answers 200 with an empty list (`listByAuthor`'s `notSuspended` also covers
  `deleted_at`, so nothing leaks there). The recommendations tab answers 200 and
  still lists every post the deleted account recommended.
- **Fix idea:** treat a deleted (and suspended) user as not found in both routes,
  as `follows.profile` does.
- **Test:** `tests/routes/users_test.ts` ("a deleted account's posts tab is not found"),
  `tests/integration/app_test.ts` ("the recommendations tab lists nothing for a deleted account").

## Admin authorization

### B32. Any moderator session can permanently purge a deleted account — High
- **Where:** `src/routes/admin.ts`, `DELETE /api/admin/users/deleted/:id`
  (`requireModerator`) and `src/services/moderation.ts` `purgeDeletedUser`,
  which checks nothing about the actor.
- **Symptom:** deleting an account deliberately requires the acting moderator
  to type the username **and re-enter their password** ("a stolen admin session
  alone cannot wipe accounts"), and the row is kept for a 30-day restore window.
  Purging, the irreversible step, needs neither: a single request from any
  moderator session hard-deletes any soft-deleted account at once (including
  ones an admin deleted), skipping both safeguards.
- **Fix idea:** require the actor's password (as `deleteUser` does), and
  consider making purge admin-only.
- **Test:** `tests/routes/admin_test.ts` ("purging a deleted account needs more than a moderator session").

## Wrong domain in generated URLs

### B33. Email-verification links point at the boot-time domain — High
- **Where:** `src/auth/auth.ts`: `baseURL` is built once at import from
  `config.APP_DOMAIN`, and `sendVerificationEmail` builds the link as
  `${baseURL}/verify-email?token=…`. Password-reset links come from Better Auth's
  `url`, which is derived from the same `baseURL`.
- **Symptom:** `docker-compose.yml` defaults `APP_DOMAIN` to `localhost:5173`,
  and `.env.example` says to "set it (or use the setup wizard) to go public".
  On an instance configured through the wizard alone, every confirmation link
  is `http://localhost:5173/verify-email?token=…`, so new accounts can never
  verify, and since `EMAIL_VERIFICATION_REQUIRED` defaults to on they can never
  sign in. Password-reset mail is affected the same way. The comment next to
  `baseURL` ("a wizard-changed domain is covered by forwarded headers below")
  is true only for `trustedOrigins`, not for links in emails.
- **Fix idea:** build email links from `getOrigin()` (the wizard → env →
  default chain) at send time, not from the import-time `baseURL`.
- **Test:** `tests/auth/auth_test.ts` ("the verification link uses the domain set in the setup wizard").
- Related: B27, B39 share the root cause (boot-time `APP_DOMAIN` used where
  the effective domain is meant).

## Federation output

### B34. The local bio is federated as raw text in an HTML field — Low
- **Where:** `src/federation/actor.ts` `buildPerson` (`summary: user.bio`).
- **Symptom:** ActivityPub's `summary` is HTML, but the bio is plain text and is
  sent unescaped. "I <3 cats & dogs" renders as broken markup on Mastodon and
  newlines collapse; the remote sanitizer is the only thing between a bio and
  injected markup. Comments already go through `textToNoteHtml` for exactly this.
- **Fix idea:** `summary: textToNoteHtml(user.bio)`.
- **Test:** `tests/federation/actor_test.ts` ("the plain-text bio is published as escaped HTML").

### B35. Defederation doesn't stop recommendations, list activity or account deletes — Medium
- **Where:** `src/federation/outbound.ts` (`followerRecipients`, used by
  `sendRecommend` / `sendUnrecommend`, and the loop in `sendActorDelete`) and
  `src/federation/lists.ts` `deliverListItem`.
- **Symptom:** inbound remote follower edges are stored as a plain actor URI
  (`follows.remote_actor`, text, no foreign key), so blocking a domain, which
  purges cached `remote_actors` rows, leaves them in place. `deliver.ts`
  accounts for that and skips followers on blocked domains; these three fan-outs
  don't consult the blocklist, so Announces, list Add/Remove and Delete(actor)
  keep being delivered to instances the admin defederated.
- **Fix idea:** share `deliver.ts`'s `remoteRecipients` (it already filters), or
  remove inbound follower edges for a domain when it's blocked.
- **Tests:** "never delivers to a follower on a defederated domain" in
  `tests/federation/{outbound,lists}_test.ts`.

### B36. A remote server can show someone else's account under its own handle — Medium
- **Where:** `src/federation/remote.ts` `resolveActor` → `cacheActor(object, handle)`.
- **Symptom:** the actor that WebFinger returns is cached under the handle that
  was *requested*, with no check that it matches the actor's own
  `preferredUsername@host`. Mastodon round-trips WebFinger to prevent exactly
  this. A hostile `evil.example` can answer WebFinger for `ceo@evil.example`
  with a real, unrelated actor (e.g. `https://mastodon.social/users/Gargron`),
  and this instance then shows that person's profile and posts as
  `@ceo@evil.example`. Because `remote_actors` upserts by `apId`, it also
  rewrites the cached handle of the genuine account until it's next re-resolved.
- **Fix idea:** accept the result only if the actor's id host equals the
  handle's host, or WebFinger on `preferredUsername@<actor host>` points back
  at the same actor id.
- **Test:** `tests/federation/remote_test.ts` ("refuses an actor whose id is not on the requested handle's host").

### B37. A private account's followers are public over ActivityPub — Medium
- **Where:** `src/federation/mod.ts`, `setFollowersDispatcher("/users/{identifier}/followers", …)`.
- **Symptom:** the web API hides a private account's follower list from anyone
  who isn't an approved follower (`services/follows.ts` `followersOf` returns an
  empty list). The ActivityPub followers collection has no such check: an
  anonymous `GET /users/<name>/followers` with an `application/activity+json`
  Accept header returns every local and remote follower.
- **Fix idea:** return `null` (or an empty collection that keeps only
  `totalItems`, as Mastodon does for hidden networks) when the user is private,
  or allow it only for a signed request from an approved follower.
- **Test:** `tests/federation/mod_test.ts` ("a private account's followers are not served to the public").

### B38. Remote boosts of local posts are lost — Medium
- **Where:** `src/federation/mod.ts`, the inbox `Announce` listener.
- **Symptom:** the boosted post is looked up with `postsRepo.findByApId`, but
  local posts store no `apId`; their ActivityPub id is derived
  (`https://<domain>/posts/<id>`). The fallback then calls
  `announce.getObject()`, which dereferences our own `/posts/<id>`, a page the
  frontend serves as HTML, so it resolves to nothing. When a Mastodon user
  boosts one of our articles, no recommendation is recorded and the author is
  never notified. Boosts of cached *remote* posts work. `Undo(Announce)` has the
  same lookup, so un-boosts of local posts are lost too.
- **Fix idea:** when the object id is on our own origin, parse `/posts/<uuid>`
  and use `postsRepo.findById`, before any remote lookup.
- **Test:** `tests/federation/mod_test.ts` ("a remote boost of one of our own posts is recorded and notified").

### B39. Actor documents vouch for the boot-time domain — Low
- **Where:** `src/app.ts`, `withAttributionDomains(res, config.APP_DOMAIN)`.
- **Symptom:** Mastodon shows an author byline on a shared article's link card
  only if the author's actor lists the article's domain in
  `attributionDomains`. That value is the boot-time `APP_DOMAIN`, so on an
  instance configured through the setup wizard every actor advertises
  `localhost:5173`, and shared articles never get the byline. Same root cause
  as B27 and B33.
- **Fix idea:** pass `await getAppDomain()` instead.
- **Test:** `tests/integration/app_test.ts` ("vouches for the domain set in the setup wizard").

### B40. A defederated server bypasses the block on a non-default port — Medium
- **Where:** `src/federation/mod.ts` `fromBlockedDomain` (`actorId.host`) and
  `src/federation/deliver.ts` (`new URL(uri).host`), into
  `blockedDomainsRepo.isBlocked` → `lib/domain.ts` `hostMatchesDomain`.
- **Symptom:** `URL.host` keeps a non-default port (`evil.example:8443`), and
  `hostMatchesDomain` compares it as-is against the bare blocked domain
  (`evil.example`), so it never matches. A blocked instance whose actor ids carry
  a port (one it can choose freely) keeps delivering follows, posts, replies and
  deletes, and keeps receiving our posts. `federation/remote.ts` already strips
  the port (`handleHost`), so handle lookups are blocked correctly.
- **Fix idea:** use `URL.hostname`, or strip a port inside `isBlocked` /
  `hostMatchesDomain` so every caller is covered. (`moderation.blockDomain`
  already strips the port via `normalizeDomain`.)
- **Also:** `remoteActorsRepo.removeByDomain` compares the stored `host`, which
  `cacheActor` takes from `URL.host` (port included), so defederating
  `evil.example` leaves cached actors on `evil.example:8443`, and their posts, in place.
- **Test:** `tests/federation/mod_test.ts` ("a defederated domain is ignored on a non-default port too"),
  `tests/federation/deliver_test.ts` ("skips followers on a defederated domain's non-default port"),
  `tests/integration/db/repositories/remoteActors_test.ts` ("by domain also takes actors on a non-default port").

### B41. A repeated remote Follow creates a duplicate follower edge — Medium
- **Where:** `src/db/repositories/follows.ts` `createRemoteFollower` (plain insert)
  and `src/db/schema.ts` `follows`: unique indexes exist for local→local and
  local→remote edges, but none for inbound remote edges (`followee_id`, `remote_actor`).
  The inbox Follow handler (`src/federation/mod.ts`) doesn't check for an existing edge.
- **Symptom:** a second Follow from the same actor with a new activity id (several
  servers resend one after a lost Accept; Fedify only dedupes identical ids) adds a
  second row. The follower count is inflated, the follower list shows the actor twice,
  and a private account sees the same request twice.
- **Fix idea:** a partial unique index on (`followee_id`, `remote_actor`) where
  `remote_actor is not null` (deduplicating existing rows in the migration), and
  `onConflictDoNothing` in `createRemoteFollower`. On a duplicate, still re-send the
  Accept so the remote side gets unstuck.
- **Test:** `tests/integration/db/repositories/follows_test.ts` ("a repeated Follow from the same remote actor is one edge").

### B42. A remote actor's Recommendations tab shows unpublished posts — Medium
- **Where:** `src/db/repositories/recommendations.ts` `listByRemoteActor`.
- **Symptom:** unlike `listByUser` and `listFeedFor`, it has no `isPublished` or
  `notSuspended` predicate. A local post a Mastodon user boosted keeps being served,
  title and body, on that actor's profile tab (`/api/remote/users/:handle/recommendations`)
  after its author moves it back to draft, or is suspended or deleted.
- **Fix idea:** add `isPublished` and `notSuspended` to the `where`.
- **Test:** `tests/integration/db/repositories/recommendations_test.ts` ("never lists a local post that is no longer published, or whose author is suspended").

### B43. Public tag search exposes tags used only on drafts — Low
- **Where:** `src/db/repositories/tags.ts` `search`, `suggest`, `listFollowedByUser`.
- **Symptom:** `setPostTags` runs for drafts too, and these queries count raw
  `post_tags` edges with no visibility predicate. A tag used only on a draft (or only
  on a private account's posts) appears in `GET /api/tags/search` with its count, so
  an unpublished draft's topic can be found by typing a prefix. The counts also
  include drafts, private and suspended posts, which `postCount`'s own comment calls
  a disclosure.
- **Fix idea:** join `posts`/`users` and count with `isPublished`, `notSuspended`,
  `visibleToViewer(null)` (as `trending` does), and drop tags whose visible count is 0.
- **Test:** `tests/integration/db/repositories/tags_test.ts` ("search and suggest never surface a tag used only on a draft", "search counts only posts an anonymous reader can see").

### B44. Federated replies never count toward trending — Low
- **Where:** `src/db/repositories/posts.ts` `listTrending`, the comment subquery
  `comments.author_id != posts.author_id`.
- **Symptom:** the predicate meant to drop an author's replies to their own post
  also drops every federated reply: its `author_id` is null, so the comparison is
  NULL. A local post discussed across the fediverse ranks as if nobody replied.
- **Fix idea:** `comments.author_id is distinct from posts.author_id` (same for the
  likes subquery, for symmetry).
- **Test:** `tests/integration/db/repositories/posts_test.ts` ("federated replies count toward a local post's trending score").

## Rate limiting

### B31. Remote-discovery limiter covers only the bare profile path — Medium
- **Where:** `src/routes/remote.ts`, `remoteRoutes.use("/users/:handle", …)`.
- **Symptom:** `RL_REMOTE_MAX` is documented (in `src/config.ts`) as the
  anonymous per-IP budget for `GET /api/remote/*`, because those reads trigger
  outbound federation requests and DB writes. Hono's `use(path)` matches that
  exact path only, so `GET /users/:handle/posts` and `/recommendations`, which
  also resolve actors and crawl outboxes, are never counted. (They are still
  charged against the tighter cache-miss budget, so this is a gap rather than
  an open door.)
- **Fix idea:** `remoteRoutes.use("/users/:handle/*", …)` in addition, or match
  every GET under the router.
- **Test:** `tests/routes/remote_test.ts` ("anonymous GET /users/:handle/posts counts against the discovery budget").

---

### B53. Full-UUID post links 404, including every reported post in the admin queue — Medium
- **Where:** `src/services/posts.ts` `getPostBySlug`: `TRAILING_SHORT_ID`
  (`/(?:^|-)([0-9a-f]{8,})$/`) reads a full UUID as its last dash group
  (`555555555555`), which no post id starts with.
- **Symptom:** `/@author/<full uuid>` answers "Post not found". The frontend's
  admin reports queue links each reported post exactly that way
  (`apps/frontend/src/lib/components/AdminReports.svelte` `subjectHref`), so a
  moderator can never open a reported post from the queue. `apps/frontend/src/lib/links.ts`
  also documents full-UUID permalinks as resolvable.
- **Fix idea:** in `getPostBySlug`, try a full UUID (anywhere in the slug) before
  the trailing short id; and have `subjectHref` build links with `postPath`.
- **Test:** `tests/services/posts_test.ts` ("a full-UUID permalink resolves the post").

## Frontend

Paths in this section are under `apps/frontend/`.

### B46. A non-JSON error response crashes the API client — Medium
- **Where:** `src/lib/api/client.ts` `request`: `JSON.parse(text)` runs on every
  non-empty body before `res.ok` is checked.
- **Symptom:** an error that doesn't come from the backend's JSON error handler
  (a 502/504 HTML page from Caddy while the backend restarts, a plain-text
  "Payload Too Large") throws a `SyntaxError` instead of an `ApiError`. Every
  caller that branches on `err instanceof ApiError` misses it: page loads turn
  into 500s instead of their 404/error pages, and forms show "Unexpected token
  '<'…" as the error message.
- **Fix idea:** parse inside a try; on failure, keep `body = null` so a failed
  response still becomes `ApiError(res.status, "Request failed (…)")`.
- **Test:** `tests/lib/api/client.test.ts` ("a non-JSON error page still surfaces as an ApiError with its status").

### B47. The API proxy re-interprets encoded `/` and `?` in a path — Low
- **Where:** `src/routes/api/[...path]/+server.ts`: the backend URL is built from
  `params.path`, which SvelteKit has already percent-decoded.
- **Symptom:** `/api/tags/a%2Fb/posts` is forwarded as `/api/tags/a/b/posts`, and
  `%3F` becomes a real query separator. Any path segment carrying user text (a
  slug, a tag, a handle) can land on a different backend route.
- **Fix idea:** forward the raw `url.pathname` (minus the `/api` prefix) instead.
- **Test:** `tests/routes/api/[...path]/server.test.ts` ("an encoded slash inside a path segment reaches the backend still encoded").

### B48. One control character in a federated title breaks a whole feed — Low
- **Where:** `src/lib/xml.ts` `escapeXml`, used by the RSS feeds and sitemaps.
- **Symptom:** XML 1.0 forbids most C0 control characters even escaped; parsers
  reject the whole document. Reading-list feeds include federated posts, whose
  titles come from other servers, so one title containing e.g. `U+0008` makes
  that list's feed unreadable for every subscriber.
- **Fix idea:** strip `U+0000–U+0008, U+000B, U+000C, U+000E–U+001F, U+FFFE, U+FFFF` (and
  lone surrogates) before escaping.
- **Test:** `tests/lib/xml.test.ts` ("drops characters XML 1.0 does not allow").

### B49. The password meter rates too-short passwords "Good" — Low
- **Where:** `src/lib/password.ts` `passwordStrength`.
- **Symptom:** the score counts character classes without regard to the minimum
  length, so `Ab1!` (4 characters, rejected on submit) shows "Good" next to a
  requirement list saying it is too short.
- **Fix idea:** cap the score at 1 ("Weak") below `MIN_PASSWORD_LEN`.
- **Test:** `tests/lib/password.test.ts` ("a password under the minimum length is never rated above Weak").

### B50. Pages fail to load when the browser blocks site storage — Low
- **Where:** `src/lib/prefs.svelte.ts` (`initialFeed`, `initialLangMode`,
  `initialLangs`, `initialComposeLang`) and `src/lib/theme.svelte.ts`
  (`initialPreference`), which read `localStorage` at import time, unguarded.
- **Symptom:** with site data blocked (e.g. Chrome's "block all cookies"), the
  `localStorage` getter throws a `SecurityError`; importing either module throws
  and the pages using them fail to hydrate, instead of running with defaults.
- **Fix idea:** wrap storage reads and writes in try/catch and fall back to the
  defaults.
- **Test:** `tests/lib/prefs.svelte.test.ts`, `tests/lib/theme.svelte.test.ts`
  ("a browser that blocks storage still gets …").
  `src/lib/components/FeedLanguageFilter.svelte` reads `localStorage` unguarded
  in `onMount` too.

### B51. "Save to list" loses a list when adding the post to it fails — Low
- **Where:** `src/lib/components/SaveToListButton.svelte` `createAndAdd`.
- **Symptom:** the new list is created, then the post is added in a second call.
  If that second call fails, the error is shown but the list, which now exists
  on the server, is never added to the menu, and the menu is not reloaded on
  reopen (`loaded` stays true). The reader sees no new list, tries again, and
  ends up with two lists of the same name.
- **Fix idea:** add the created list to `lists` (with `contains: false`) as soon
  as `createList` succeeds, before attempting `addToList`.
- **Test:** `tests/lib/components/SaveToListButton.test.ts` ("a list that was created stays in the menu …").

### B52. Failed loads in settings lists claim the list is empty — Low
- **Where:** `src/lib/components/ConnectionsManager.svelte` (`ensureLoaded`),
  `FollowedTagsManager.svelte` (`load`), `FollowListDialog.svelte`
  (`onOpenChange`, which doesn't catch at all).
- **Symptom:** the load error is swallowed and the empty state renders: "You
  haven't muted anyone.", "You don't follow any tags yet.", "No followers yet."
  A reader whose request merely failed is told their blocks, tags or followers
  are gone. The actions (unmute, unfollow, remove follower) also fail silently.
- **Fix idea:** track an error state and show "Couldn't load …" with a retry,
  as `WebhookTokensManager.svelte` already does.
- **Test:** `tests/lib/components/ConnectionsManager.test.ts`,
  `tests/lib/components/FollowedTagsManager.test.ts` ("a failed load says so …"),
  `tests/lib/components/FollowListDialog.test.ts` ("BUG: a failed load doesn't
  claim there are no followers"; error tagged `[BUG pin]`).

### B54. Signing in with "@handle" is sent as an email sign-in — Low
- **Where:** `src/routes/login/+page.svelte` (`submit`:
  `identifier.includes("@")`).
- **Symptom:** any identifier containing "@" goes to `signIn.email`. Fediverse
  users habitually type their handle as "@ada"; that fails as an email and
  shows the server's email error instead of signing them in.
- **Fix idea:** strip one leading "@", then treat the rest as an email only if
  it still contains "@".
- **Test:** `tests/routes/login/page.test.ts` ("BUG: a username typed with a
  leading @ …").

### B55. A network error on the verify-email page hangs on "Confirming…" — Low
- **Where:** `src/routes/verify-email/+page.svelte` (`onMount` awaits
  `authClient.verifyEmail` with no try/catch).
- **Symptom:** if the request throws (offline, proxy down), the page stays on
  "Confirming your email…" forever and the rejection goes unhandled. The error
  view with its resend form never shows.
- **Fix idea:** wrap the call in try/catch and set the same error state as a
  `res.error` response.
- **Test:** `tests/routes/verify-email/page.test.ts` ("BUG: a network failure
  while verifying …"). Its error is tagged `[BUG pin]`, which
  `vitest.config.ts` `onUnhandledError` ignores.

### B56. "Resend confirmation link" on the login page also re-submits sign-in — Low
- **Where:** `src/routes/login/+page.svelte`: the Resend `<Button>` sits inside
  the sign-in `<form>` with no `type`. Neither `ui/Button.svelte` nor bits-ui
  `Button.Root` defaults one, so it is a submit button.
- **Symptom:** one click runs `resendConfirmation()` *and* `submit()`. Sign-in
  is attempted again (with an email, a second request, and with
  `sendOnSignIn` a second link), and `submit()` clears `resendError`/`resent`,
  so "Enter your email address above…" disappears as soon as it is shown.
- **Fix idea:** `type="button"` on the Resend button. Other non-submit
  `<Button>`s inside forms may share the issue.
- **Test:** `tests/routes/login/page.test.ts` ("BUG: clicking Resend doesn't
  submit the sign-in form again").

### B57. Admin "Edit profile" can wipe an account's tags and links — Medium
- **Where:** `src/lib/components/AdminUsers.svelte` (`openEdit`). It fetches
  the account detail only when `detailLoadingId !== u.id`, and otherwise (or
  when the fetch fails) seeds the form from the bare table row, which has no
  tags or links.
- **Symptom:** expand a row and pick "Edit profile…" before its detail loads
  (or open Edit when the detail request fails). The dialog shows no tags or
  links. Adding one tag saves `tags: ["new"]`, silently deleting every
  existing tag (likewise links).
- **Fix idea:** await the in-flight detail request instead of skipping it, and
  don't allow saving tags/links when the detail couldn't be loaded.
- **Test:** `tests/lib/components/AdminUsers.test.ts` ("BUG: editing while the
  row's detail is loading keeps its existing tags").

### B58. Restoring or erasing while searching deleted accounts breaks the count — Low
- **Where:** `src/lib/components/AdminUsers.svelte` (`restoreDeleted`,
  `purgeDeleted`) decrement `deletedTotal` but not `deletedFilteredTotal`.
- **Symptom:** with a search active, erasing the only match shows "1 of 0
  accounts · showing 0"; "Load more (x of N)" is off by one the same way.
- **Fix idea:** decrement `deletedFilteredTotal` alongside `deletedTotal`.
- **Test:** `tests/lib/components/AdminUsers.test.ts` ("BUG: erasing a
  searched-for account keeps the search count honest").

### B59. Settings stays "unsaved" after saving a tag or link change — Low
- **Where:** `src/routes/settings/+page.svelte` (`dirty`). The text fields
  compare against the live `data.user`, but tags and links compare against
  `initialTags` / `initialLinks`, constants captured at mount.
- **Symptom:** after saving a tag or link change (and `invalidateAll`
  refreshing `data.user`), `dirty` stays true: "Saved." never appears and Save
  stays enabled until the page is reloaded.
- **Fix idea:** derive the baselines from `data.user.tags` / `data.user.links`.
- **Test:** `tests/routes/settings/page.test.ts` ("BUG: after saving a tag
  change the form is no longer dirty").

### B60. Settings uploads a new photo even when the save then fails validation — Low
- **Where:** `src/routes/settings/+page.svelte` (`save`): the avatar upload
  runs before the profile-link validation loop.
- **Symptom:** with a staged photo and an invalid link, the photo is replaced
  on the server while the page shows "Enter a valid … web address." and still
  treats the photo as unsaved (the next save uploads it again).
- **Fix idea:** validate links before any request.
- **Test:** `tests/routes/settings/page.test.ts` ("BUG: an invalid link stops
  the save before the photo is uploaded").

### B61. A failed "Show more" is silent and leaks an unhandled rejection — Low
- **Where:** `loadMore` (try/finally, no catch) in
  `src/routes/[handle]/+page.svelte` (posts and `loadMoreRecommended`),
  `src/routes/+page.svelte`, `src/routes/lists/[id]/+page.svelte`,
  `src/routes/tags/[tag]/+page.svelte`, `src/routes/notifications/+page.svelte`
  and `src/lib/components/Comments.svelte`. Only `posts/manage` catches it.
- **Symptom:** when the next page fails to load, the button flips back from
  "Loading…" and nothing tells the reader; the error surfaces only as an
  unhandled promise rejection in the console.
- **Fix idea:** catch, show a short inline "Couldn't load more. Try again."
- **Test:** `tests/routes/[handle]/page.test.ts` ("BUG: a failed Show more
  tells the reader"). Its error is tagged `[BUG pin]` (see B55).

### B62. The setup wizard sends every 400 back to the Admin step — Low
- **Where:** `src/routes/setup/+page.svelte` (`finish`:
  `if (err.status === 400) step = 1`).
- **Symptom:** the backend's `setupSchema` also answers 400 for the instance
  name (over 100 characters; the input has no `maxlength`) and for the email
  settings (e.g. an SMTP port over 65535). The operator is moved to the Admin
  step with an error about a field that isn't on it.
- **Fix idea:** have the backend name the failing field (or step) and route on
  that; at least add `maxlength={100}` and a port range to the inputs.
- **Test:** `tests/routes/setup/page.test.ts` ("BUG: a refused SMTP port keeps
  the operator on the Email step").

### B63. Acting on a post in "Your posts" jumps back to the first tab — Low
- **Where:** `src/routes/posts/manage/+page.svelte`. `ensureLoaded` switches
  tabs with `replaceState` (shallow routing), which updates the address bar
  but not SvelteKit's own URL (`replaceState` keeps `page.url`, and
  `_invalidate` reloads `current.url`, in `@sveltejs/kit` client.js). `act()`
  then calls `invalidateAll()`, so the load re-runs for the tab the page was
  opened on, and the `$effect` sets `active = data.tab`.
- **Symptom:** open Drafts, switch to Published, unpublish a post: the page
  snaps back to Drafts, and the Published lane (deliberately not blanked)
  still lists the post until it is refetched. Same for Publish now /
  Unschedule / Delete from any tab other than the one in the original URL.
- **Fix idea:** `goto(..., { replaceState: true, noScroll: true, keepFocus: true })`
  for the tab switch, or have `act()` refetch the active lane and the counts
  itself instead of `invalidateAll()`.
- **Test:** `tests/routes/posts/manage/page.test.ts` ("BUG: acting on another
  tab keeps the author on that tab"). The test stands in for `invalidateAll`
  by re-rendering with the original tab's load result. That is SvelteKit's
  behaviour per its source, not observed in a browser.

### B64. Dashboard chart days are labelled a day early west of UTC — Low
- **Where:** `src/routes/dashboard/+page.svelte` (`dayLabel`). Series days
  are UTC calendar dates (`2026-01-05`, from the backend's `lib/analytics.ts`
  `today()`); `new Date("2026-01-05")` is UTC midnight, which is then
  formatted in the reader's zone.
- **Symptom:** for a reader in New York (or anywhere in the Americas) every
  bar's label and the range's start/end dates show the previous day.
- **Fix idea:** format the day with `timeZone: "UTC"` (it's a date, not an
  instant), or bucket views per reader zone on the backend.
- **Test:** `tests/routes/dashboard/page.test.ts` ("BUG: day labels don't
  shift a day for readers west of UTC").

### B65. "Unschedule, keep as draft" fails on a scheduled post you haven't edited — Medium
- **Where:** `src/routes/compose/+page.svelte` (`persist("draft")` returns
  early when `!hasContent()`, and `hasContent()` is false until `touched`,
  i.e. until the author edits something; the Tiptap editor's `onUpdate` doesn't
  fire on load).
- **Symptom:** open a scheduled post from "Your posts" and choose
  "Unschedule, keep as draft": the page says "Nothing to save yet." and
  nothing is sent, so the post still goes out at its scheduled time. The same
  refusal hits "Save draft" on any reopened, unedited post (harmless there).
- **Fix idea:** for an existing post (`postId` set), let a status change
  through regardless of `touched`; keep the empty-content guard for new posts.
- **Test:** `tests/routes/compose/page.test.ts` ("BUG: an untouched scheduled
  post can be unscheduled").

### B66. Sentences split across `{#if}` blocks lose their spaces — Low
- **Where:** Svelte 5 trims whitespace at the start and end of a block's
  content, and these sentences have no whitespace outside their blocks:
  `src/routes/search/+page.svelte`, the Articles empty state
  (`“{data.query}”{#if tag} with tag …{/if}{#if author} by …{/if}.`);
  `src/routes/contact/+page.svelte`, the Fediverse paragraph
  (`ActivityPub{#if …} at <code>…</code>{:else} when federation is enabled{/if}.`);
  and the stock-photo credit line (`{source}</a>{#if license} · <a>…`) in both
  `src/routes/[handle]/[slug]/+page.svelte` (every reader sees it under the
  banner) and `src/lib/components/BannerPicker.svelte`.
- **Symptom:** "No articles match “de”with tag #denoby ada.", "This instance
  federates via ActivityPubat blog.example." (or "ActivityPubwhen federation
  is enabled"), and "Photo by Jo on Unsplash· CC0".
- **Fix idea:** put the spaces outside the blocks (or use `{" "}`).
- **Test:** `tests/routes/search/page.test.ts` ("BUG: the filtered empty state
  keeps its spaces"), `tests/routes/contact/page.test.ts` ("BUG: the
  federation sentence keeps its space"),
  `tests/routes/[handle]/[slug]/page.test.ts` ("BUG: the cover credit keeps a
  space before the licence"), `tests/lib/components/BannerPicker.test.ts`
  ("BUG: the credit keeps a space before the licence").

### B67. A home feed tab that fails to load says it is empty — Low
- **Where:** `src/routes/+page.svelte` (`ensureLoaded`: try/finally, no
  catch).
- **Symptom:** when a tab's first fetch fails, `loading` returns to false with
  no items, so the tab shows its empty state ("No articles on this instance
  yet.", "Your feed is empty. Follow some writers to fill it.") instead of an
  error, and switching back to the tab doesn't retry (it only reloads on a tab
  *change* while `loaded` is false). The rejection is unhandled. Same class
  as B52.
- **Fix idea:** track an error per feed and show "Couldn't load. Try again."
- **Test:** `tests/routes/page.test.ts` ("BUG: a tab that fails to load
  doesn't claim to be empty"; error tagged `[BUG pin]`).

### B68. A feed language change made while the timeline loads is lost — Low
- **Where:** `src/routes/+page.svelte`, the language-filter `$effect`: it
  returns early when the active feed is `loading`, and nothing re-applies the
  filter once that load settles.
- **Symptom:** change the language filter while Local/Global is still
  loading (e.g. right after opening the page with a saved filter, or right
  after switching tabs): the timeline settles on the old filter's results
  and stays that way until the filter changes again.
- **Fix idea:** remember a pending refetch and run it when the load settles,
  or abort the in-flight load and refetch.
- **Test:** `tests/routes/page.test.ts` ("BUG: a filter change made mid-load
  still applies").

### B69. Seen notifications aren't marked read when the badge count is stale — Low
- **Where:** `src/lib/components/Nav.svelte` (`loadNotifications`) and
  `src/routes/notifications/+page.svelte` (`onMount`) both mark all read only
  `if (notifications.count > 0)`; the count comes from
  `lib/notifications.svelte.ts`, polled every 30 s.
- **Symptom:** a notification that lands between polls shows as unread in the
  bell dropdown, but nothing marks it read: the badge clears (`clear()`) and
  comes back on the next poll for something the reader already saw. Worse on
  the Notifications page: loading `/notifications` directly (a reload, or a
  link from an email) runs `onMount` before the nav's first count request has
  answered, so with the count still 0 nothing is marked read at all.
- **Fix idea:** decide from the fetched items (`items.some((n) => !n.read)`)
  rather than the polled count.
- **Test:** `tests/lib/components/Nav.test.ts` ("BUG: opening the bell marks
  fresh unread notifications read"), `tests/routes/notifications/page.test.ts`
  ("BUG: unread notifications on screen are marked read even before the badge
  count arrives").

### B70. The custom-section preview can show text you've already deleted — Low
- **Where:** `src/lib/components/CustomSectionEditor.svelte` (`loadPreview`):
  the empty-source early return doesn't bump `previewToken`.
- **Symptom:** open Preview (request in flight), go back to Write, clear the
  section, open Preview again: the earlier request lands, passes the token
  check, and shows the old rendering for an empty section (and caches it as
  current).
- **Fix idea:** `++previewToken` (and reset `previewLoading`) on the empty
  path too.
- **Test:** `tests/lib/components/CustomSectionEditor.test.ts` ("BUG: a slow
  preview of old text doesn't show after the text is cleared").

### B71. The photo picker reopens on the last search after a pick — Low
- **Where:** `src/lib/components/StockPhotoPicker.svelte`. `pick()` closes
  with `open = false`, which bits-ui doesn't report through `onOpenChange`
  (it only fires for its own interactions), so the reset there never runs.
- **Symptom:** after choosing a photo, the next "Choose a photo" opens with
  the previous query and results, which the component's own comment says it
  must not ("would look like a response to a query the author hasn't typed").
- **Fix idea:** reset in `pick()` as well, or reset when `open` becomes true.
- **Test:** `tests/lib/components/StockPhotoPicker.test.ts` ("BUG: after
  picking, the next open starts clean").

### B72. Switching photo provider mid-search shows the other provider's photos — Low
- **Where:** `src/lib/components/StockPhotoPicker.svelte` (`switchTo` →
  `run`, which returns early while `searching`).
- **Symptom:** switch from Openverse to Unsplash while a search is running:
  the switch's search is dropped and the Openverse results fill the Unsplash
  tab. Picking one then sends `recordPhotoUse("unsplash", <openverse token>)`.
- **Fix idea:** a request token like `CustomSectionEditor`'s, and let a
  provider switch supersede the running search.
- **Test:** `tests/lib/components/StockPhotoPicker.test.ts` ("BUG: switching
  provider mid-search shows the new provider's photos").

### B73. Several actions fail silently: block/mute, list delete, follow requests — Low
- **Where:** `src/lib/components/ProfileMenu.svelte` (`toggleMute`,
  `toggleBlock`: try/finally, no catch), `src/routes/lists/[id]/+page.svelte`
  (`removeList` awaits `deleteList` with no try/catch) and
  `src/routes/follow-requests/+page.svelte` (`act`: try/finally, no catch).
- **Symptom:** if the request fails, nothing tells the user: the menu or
  confirm dialog closes and the page looks as before; the rejection is
  unhandled. For Block in particular, a reader may believe they've blocked
  someone they haven't.
- **Fix idea:** catch and show the error, as `posts/manage` does.
- **Test:** `tests/lib/components/ProfileMenu.test.ts` ("BUG: a failed block
  tells the reader"), `tests/routes/lists/[id]/page.test.ts` ("BUG: a failed
  delete tells the owner"), `tests/routes/follow-requests/page.test.ts` ("BUG:
  a failed approval tells the account owner"); errors tagged `[BUG pin]`.

### B74. Your Profile tab lights up on other people's profiles — Low
- **Where:** `active()` in `src/lib/components/SideNav.svelte` and
  `src/lib/components/MobileNav.svelte`: `path.startsWith(href)`.
- **Symptom:** signed in as `@ada`, visiting `/@adam` (or `/@ada@remote.example`)
  highlights the rail's Profile item, and the mobile tab bar marks Profile
  `aria-current="page"`, so screen readers announce the wrong current page.
- **Fix idea:** match `href` exactly or as a path prefix followed by `/`.
- **Test:** `tests/lib/components/SideNav.test.ts` ("BUG: another user's
  profile doesn't highlight your Profile"), `tests/lib/components/MobileNav.test.ts`
  ("BUG: another user's profile isn't announced as your Profile").

### B75. The avatar cropper can't be repositioned from the keyboard — Low
- **Where:** `src/lib/components/AvatarCropper.svelte`: the viewport has
  `role="slider"`, `tabindex="0"` and `aria-valuenow`, but only pointer
  handlers.
- **Symptom:** a keyboard or screen-reader user can focus a control announced
  as a slider, and arrow keys do nothing; the crop can only be zoomed (bits-ui
  Slider), never panned.
- **Fix idea:** handle arrow keys (nudge `offset` through `clamp`), or drop the
  slider role.
- **Test:** `tests/lib/components/AvatarCropper.test.ts` ("BUG: arrow keys
  reposition the photo").

### B76. Pasting or picking several images scatters them to the end of the post — Low
- **Where:** `src/lib/editor/Editor.svelte` (`uploadImages`): with no drop
  position, each image is inserted at the cursor and then
  `focus("end")` moves the cursor to the end of the document. Only the
  drag-and-drop path tracks an insertion position.
- **Symptom:** pasting two screenshots after "before" in
  `<p>before</p><p>after</p>` gives
  `before, img1, after, img2`: the second image lands at the very end of the
  article. A single paste mid-article also throws the caret to the bottom.
  The function's own comment says pasting several files keeps their order.
- **Fix idea:** track the position like the drop path does (start from the
  selection), and focus just after the inserted paragraph rather than `"end"`.
- **Test:** `tests/lib/editor/Editor.test.ts` ("BUG: several images inserted
  at the cursor stay together, in order").

## Observations (not pinned by a test)

- **Editing a published post has no unsaved-changes guard.**
  `apps/frontend/src/routes/posts/[id]/edit/+page.svelte` has neither the
  `beforeunload` handler nor the `beforeNavigate` guard the composer has, and
  no autosave (deliberately, since it would federate an Update). Following a
  nav link or closing the tab after editing a published post drops the edit
  without a prompt. A design gap rather than broken code, so not pinned.

- **Admin profile edits always resend unchanged profile links.**
  `apps/frontend/src/lib/components/AdminUsers.svelte` `saveEdit` ends with a
  fallback that compares the canonical link URLs it built with
  `initial.links`, which holds the editor's identifiers ("bob", not
  "https://github.com/bob"). They never match, so any save of an account that
  has links also sends `links`, and the backend deletes and re-inserts the
  same rows. Harmless today, but the fallback is dead logic as written.

- **"Next Monday" in the schedule dialog uses the browser's zone for the weekday.**
  `apps/frontend/src/lib/components/ScheduleDialog.svelte` finds Monday with
  `d.toDate(zone).getDay()`; `getDay()` reads the runtime's local zone, not
  `zone`. The two agree once `rememberTimeZone` has run (the usual case), but a
  zone far ahead of the browser's would land on Tuesday. `getDayOfWeek` from
  `@internationalized/date` avoids the mix.

- **Feed items print "Invalid Date" for an unparseable timestamp.**
  `apps/frontend/src/lib/rss.ts` `renderItem` passes `pubDate` straight to
  `new Date(...).toUTCString()`. The backend always sends a valid ISO string, so
  this can't happen today; `lib/sitemap.ts` already guards the same case.

- **Sitemap `lastPostAt` / `lastItemAt` are typed `Date` but arrive as strings.**
  `tags.listSitemapTags`, `posts.listSitemapProfiles` and
  `readingLists.listSitemapLists` declare their `max(...)` columns as `sql<Date>`, but postgres.js
  returns raw Postgres timestamp text (`2026-10-01 18:21:53.5+00`). The frontend
  parses it with `new Date()`, which V8 accepts, so nothing breaks today. A
  `.mapWith(posts.createdAt)` would make the type honest.

- **Upload routes buffer the whole body before checking its size.**
  `src/routes/users.ts` (`POST /me/avatar`), `src/routes/media.ts`,
  `src/routes/admin.ts` (two upload handlers) call `c.req.arrayBuffer()` and
  only then compare against the 2 MB / 5 MB caps. In the default stack every
  `/api` request passes through the SvelteKit server, whose `BODY_SIZE_LIMIT`
  is 5 MB, so this is defence-in-depth only. A deployment that exposes the
  backend directly would let a signed-in user make it buffer arbitrarily large
  bodies (bounded only by the upload rate limiter). Checking `Content-Length`
  first and reading with a cap (as `lib/inboxBody.ts` does for the inbox) would
  close it.

- **The setup wizard's test-email endpoint is an unauthenticated network
  probe until setup completes.** `POST /api/setup/test-email`
  (`src/routes/setup.ts`) accepts arbitrary SMTP host/port settings from anyone
  while `isSetupComplete()` is false, connects to them from the server, and
  returns the connection error verbatim ("Could not connect to 10.0.0.5:6379:
  ECONNREFUSED"). On a freshly deployed, internet-reachable instance that
  window can be used to scan the server's internal network (`mode: "direct"`
  also sends mail to any address). This is the same bootstrap trade-off as the
  TLS ask endpoint and may be acceptable, but it's worth a deliberate decision:
  e.g. a one-time setup token printed to the backend log, or generic error text.
