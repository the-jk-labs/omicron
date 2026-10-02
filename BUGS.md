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

## Frontend

Paths in this section are under `apps/frontend/`.

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
  tells the reader"). Its error is tagged `[BUG pin]`, which
  `vitest.config.ts` `onUnhandledError` ignores.

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
  *change* while `loaded` is false). The rejection is unhandled.
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
