# Accessibility implementation and verification

## Status and scope

Target: **WCAG 2.2 Level AA** for the web application and **ATAG 2.0
Level AA**, Parts A and B, for its web authoring workflows and content pipeline.
Native mobile applications are outside this evaluation.

**Conformance has not been established.** This is an engineering checklist,
not a conformance claim, certification, or accessibility statement. Evidence
for one component or fixture does not establish a pass for an entire criterion.
No criterion below is signed off until all applicable pages, states, and complete
processes have been evaluated. Third-party challenges and federated/user content
must be included when determining the scope of any eventual claim.

Standards:

- <https://www.w3.org/TR/WCAG22/>
- <https://www.w3.org/TR/ATAG20/>
- <https://www.w3.org/WAI/atag/report-tool/>

ATAG references WCAG 2.0. Use WCAG 2.2 AA for new implementation work, while
recording the WCAG version and legacy parsing assessment needed by the ATAG
evaluation rather than silently treating the standards as interchangeable.

## Implemented evidence

- Backend sanitization retains passage language/direction, alternatives,
  captions, accessible names, and table-header associations. IDs and IDREFs use
  a content-only namespace. See `apps/backend/tests/lib/sanitize.test.ts`.
- The editor preserves supported accessibility attributes across HTML/JSON
  round trips, including caption language and IDs. See
  `apps/frontend/tests/lib/editor/extensions.test.ts`.
- Image alternatives and non-drag sizing, passage language/direction, table
  captions and headers, text/alternative search, document navigation, and
  author-directed review/repair have component and unit tests under
  `apps/frontend/tests/lib/editor/`.
- Shared writing guidance is available in the article editor, profile Markdown
  editor, and administrator-managed public information editor.
- Skip navigation, focus styling, reduced-motion CSS, named controls, valid
  detail lists, chart semantics, and keyboard-operable tag suggestions have
  regression coverage. Photo cropping offers direction buttons as well as
  dragging and keyboard controls.
- `apps/frontend/tests/accessibility.ts` runs axe's WCAG A/AA rules against
  selected route/component fixtures, including administrative and settings tabs.
  These tests run in `pnpm check`; `pnpm test:accessibility` runs the named
  accessibility checks separately.
- Image display in the shared navigation offers system/show/hide preferences.
  The default follows reduced motion, including a CSS fallback without JavaScript.
  Hiding uses opacity, preserving image alternatives in the accessibility tree;
  visible descriptions are added outside editing surfaces only. This is a local
  display preference, not a content transformation or a flashing-content guarantee.
- Rich editing detects a removed-element/attribute/text inventory on opening
  imported content. Detected loss makes the editor read-only until acknowledgement.
  Mounting and acknowledging alone do not update the body; a title-only autosave
  keeps the original HTML. Tests cover supported content and the figure/caption
  regression. This inventory is not a complete semantic equivalence check.
- `apps/frontend/tests/browser/accessibility.spec.ts` exercises production-built
  SvelteKit pages in Chromium, using an isolated loopback API with no database.
  `pnpm test:browser` runs it locally; the browser CI job is configured to retain reports/traces.
- `apps/frontend/tests/browser/autosave.spec.ts` checks controlled save failures,
  retry, a simulated expired session, and keyboard/native-browser leave guards.
  These fixtures do not exercise real authentication or database persistence.
- Clipboard HTML is compared with the actual parsed editor slice before it can
  replace a selection. Detected loss opens a cancellable review dialog; accepted
  pastes remain undoable. Supported block metadata is retained rather than lost
  by joining the pasted paragraph to its target. A single clipboard image file
  is rehosted together with its existing attributes and surrounding content;
  ambiguous file/image associations are rejected with repair instructions.
  Screenshots with no description remain unreviewed, not automatically labelled.
- The accessibility-rich backend fixture covers meaningful/decorative images,
  passage language/direction, figure/caption associations, long descriptions,
  table headers, and MathML through the supported import parsers, native export,
  offline HTML, WordPress output, re-import, and ActivityPub JSON-LD.
  Repository-mocked Create/Update handlers and outbox crawling retain that fixture.
- `apps/backend/tests/integration/accessibilityPersistence.test.ts` exercises
  real session cookies, the assembled HTTP application, PostgreSQL, and temporary
  media files. It checks the fixture through post creation/read/edit in all three
  publication states, native/offline HTML/WordPress export, all supported import
  parsers, and two native import/export hops. Image bytes, ownership, references,
  duplicate retries, concurrent imports, publication policy, and failure cleanup
  are checked. Background delivery is stubbed; signed federation is not covered.
- `apps/backend/tests/integration/signedFederation.test.ts` runs two isolated
  Omicron processes with separate databases, keys, queues, and temporary files.
  Real signed Create/Update deliveries preserve the fixture through receiver SQL
  and the reader API in both directions. Tests cover duplicate delivery, Cavage
  and RFC 9421 signatures, unsigned/wrong-signer/modified/stale rejection, and
  restricted-content exclusion. The test transport permits loopback, not remote
  networking; signature verification remains enabled.
- Outbound Article body image/link references are resolved against the publishing
  post, preserving their URL context outside the instance. This fixes relative
  body-image URLs on the wire; alternatives and content ID references remain intact.
- The editor's live table view renders saved captions and keeps table names,
  language, and caption metadata in sync with edits and undo. Caption editing
  remains in Table accessibility; the live caption is read-only and does not
  introduce editor-only attributes into stored HTML.
- External HTML drops use the same parsed-slice loss review as clipboard pastes.
  Cancellation leaves the document unchanged. Supported descriptions and context
  accompany a rehosted image; bare image files remain unreviewed. Drops retain
  their mapped pointer position during asynchronous uploads and do not replace
  the old text selection. Internal model moves/copies retain native behavior
  without uploading another copy. Ambiguous associations, unsupported files, and
  unmatched file-plus-text payloads fail with repair instructions rather than
  silently discarding information.
- Editor transfer edge cases use real ProseMirror text/cell selections and parsed
  slices. Tests cover partial replacement, destination table cells, spans and
  explicit headers, rich/nested-caption loss detection, mapped asynchronous image
  uploads, long-description associations, cancellation, and undo. The reference
  follow-up below fixes the two association defects found by those tests;
  attribute retention alone is not proof that references still resolve correctly.
- External transfers remap colliding IDs together with bundled ARIA IDREFs,
  table headers, caption metadata, and same-document fragment links. The proposed
  result is checked before insertion and again after uploads. Missing/ambiguous
  targets wait for repair, without an option to insert broken references. The
  existing authoring body is not rewritten to repair older reference defects.

### Limits of these checks

The component environment is jsdom, with no real layout, painted colours, or
assistive-technology integration. The axe helper disables colour-contrast
analysis for that reason. It cannot establish contrast, target geometry, zoom,
reflow, focus visibility/occlusion, text-spacing resilience, or screen-reader
usability. Hidden states, dialogs, failures, and populated data require further
coverage beyond the included fixtures. A clean axe result is not a WCAG pass.

The Chromium suite checks four representative routes (home, sign-in, article,
composer) in both themes, including axe contrast analysis. It checks page-width
overflow under 320 CSS-pixel/text-spacing conditions, skip focus, image settings,
authoring-dialog focus containment/return, forced-colour focus styling, image-menu
target sizes, and import autosave. These are limited fixtures, not all pages,
states, content, or browser zoom testing. The image fixture is a single-frame
GIF; tests assert visibility, not animation timing or flashing thresholds.
Native Chromium clipboard checks additionally cover cancel/accept/undo in both
themes, image-file plus HTML rehosting, supported language/heading metadata, and
explicit paste-as-plain-text. A live-table check covers caption visibility and name
updates through the settings dialog. Other applications' clipboard formats still need testing.
Additional native clipboard fixtures cover partial replacement, complex tables,
table-cell insertion, image/long-description autosave, and rich-caption review
with cancellation/acceptance/undo. A trusted HTML drop targets a data cell while
the old selection covers the article; the helper asserts the event is trusted
and includes HTML. Rectangular cell selections and backward selections are
currently component-only checks, not complete browser selection coverage.
Additional native paste/drop checks verify collision remapping and undo; an
image-only native copy/paste is held for repair when its long-description target
would be removed. Repeated table paste checks remapped caption/header/description
IDs. These checks do not establish that a unique target has the intended meaning.
Pointer-drag tests use a controlled HTML source and Chromium's trusted drag events
for loss review in both themes and internal image movement. A document-navigation
and native cut/paste check verifies a keyboard alternative to moving an image.
File cases use explicit DOM `DragEvent`s with file-bearing `DataTransfer` objects:
in this setup, a native web-page drag converted the generated test file to
`text/plain` and delivered no files. Both helpers retain payload reports. File tests cover
metadata, unreviewed images, and upload failure/focus, not physical file-manager
drags from operating systems or other applications.

Browser axe reports retain raw violations and incomplete results. A narrowly
reviewed exception handles numeric-only reaction labels when the exact visible
number is present as a token in `aria-label`: axe 4.14 discards parentheticals
before comparing, incorrectly dropping counts such as `Like (0 likes)`. Other
label/name mismatches still fail. The card excerpt is outside its stretched
title link, separating descriptive context from the visible link label.

The authoring review is deliberately advisory. Heading-order and caption prompts
are not automatic declarations of WCAG failure. The checker does not invent alt
text, block publication, or guarantee that descriptions and relationships are
correct. The writing guide supplies manual review instructions alongside it.

## Open implementation/evaluation work

- Inventory and test every transformation: clipboard, rich editing, Markdown,
  import/export, API/webhook publishing, and federation. Supported editor nodes
  preserve tested metadata; opening-import, clipboard, and external-drop warnings cover detected
  inventory losses, not all semantic changes or arbitrary allowed HTML/MathML.
  Cross-application transfer formats, arbitrary partial/cell selections,
  reference meaning and header semantics, and operating-system file-manager drags
  still need evaluation beyond the controlled fixtures.
- Evaluate the image-hiding mechanism in every reading/editing surface and
  assess flashing content. Hiding is not frame-level pause/resume and does not
  alter media sent to other instances.
- Complete real-browser checks of both themes, narrow screens, browser zoom,
  text spacing, forced colours, and all controls' non-text contrast/target size.
- Evaluate whole keyboard and screen-reader workflows, including modal focus
  return, authentication/recovery, autosave/session expiry, publishing,
  scheduling, import, moderation, and third-party bot protection.
- Complete ATAG applicability, documentation/examples, stock-photo/pre-authored
  content, and manual-checking coverage assessments. The separate user-facing
  documentation site has not been changed by this implementation.

## Verification record

Verified on 2026-11-01 with Node 26.7.0 and pnpm 12.16.1:

- Backend (previous phase; unchanged here): `pnpm fmt`, then `pnpm check --strict`; 140 test files and 2,616 unit tests pass, with no type/lint warnings.
- Frontend: `pnpm fmt`, then `pnpm check --strict`; 174 test files and 1,667 tests pass, with no type/lint warnings.
- Frontend: `pnpm test:accessibility`; 47 named checks pass across 33 test files.
- Frontend: `pnpm test:browser`; production build plus 32 Chromium tests pass.
  Chromium 156.0.8078.4 / Playwright 1.64.1; the local Linux installation used
  Playwright's Ubuntu fallback browser package. Vite reports a large-chunk advisory.
- `git diff --check` passes.

Database integration tests were not run locally during that implementation phase;
the storage follow-up below records the subsequent run. The separate accessibility
test command can print jsdom canvas diagnostics; canvas measurement is unavailable
in that environment and is not evidence of passing visual checks.

### GitHub CI

[CI run 41282489989](https://github.com/the-jk-labs/omicron/actions/runs/41282489989)
passed on 2026-11-01 for commit `82146e0`. All six jobs succeeded: backend,
frontend, browser accessibility, container image builds, mobile checks, and
React Doctor. The backend visibility integration step passed against CI's
disposable PostgreSQL service; this does not verify the complete accessibility
content pipeline against real storage or signed federation delivery.

Manual accessibility validation is skipped for this PR. Deployed-instance checks
and screen-reader evaluation have not been performed. Unverified criteria remain
pending, and no WCAG or ATAG conformance claim is made.

### Deployment behavior

The URL-context fix takes effect when the updated backend builds a new outgoing
Article, including a later update to a post. It does not rewrite stored HTML,
run a migration, or automatically resend existing remote copies. No production
deployment or data changes were performed during this verification.

### Database/storage follow-up — 2026-11-01

The persistence suite uses a freshly created, loopback-only PostgreSQL 16
container and per-test temporary upload directories. An empty database dump was
created and its archive listing validated before applying migrations. No non-test
database, production service, or existing upload directory was changed.

The initial suite contained 24 passing checks and one expected-failure bug pin. The
pin was first run as a normal test and failed at the quota assertion: an import
whose upload-directory creation fails leaves no post, but retains the first
image's reserved bytes. `services/media.ts` reserves quota before `mkdir`, which
was outside its compensating `try`/`catch`. The original test-only change did not fix it.
A separate real file-write failure test confirms the existing write-error
cleanup and subsequent retry work.

Verification: `pnpm fmt`, then `pnpm check --strict` (2,616 unit tests; no
type/lint warnings), and the complete `pnpm test:integration` suite (32 files,
329 passing tests and one expected failure). The persistence suite contributes
24 passing tests and that single bug pin. Node 26.7.0 / pnpm 12.16.1 were used.

The quota-leak follow-up moves directory creation inside that compensating block.
The same reproduction is now a normal passing test, including a successful
archive retry after storage is repaired. Unit tests also verify that a failed
cleanup does not mask the original directory error. This releases new failed
reservations; it does not repair historical orphan records or change quota limits.
The follow-up passes `pnpm fmt`, `pnpm check --strict` (2,618 unit tests), and
all 330 integration tests; the persistence suite now has 25 ordinary passes.

The fixtures prove preservation of the tested attributes, relationships, and
image bytes, not equivalent visual meaning or appropriate descriptions. Native
archives carry bundled bytes; WordPress/RSS external images remain linked and
are not downloaded. Standalone offline HTML is inspected, not re-imported as a
native archive. Browser editing, image optimization, signed federation delivery,
and assistive-technology behavior remain outside this suite. Manual validation
remains skipped and every unsigned criterion remains pending.

### Signed federation follow-up — 2026-11-01

The new suite uses two independent Omicron processes, generated PostgreSQL
databases, real actor documents/key retrieval, actual HTTP delivery, and the
in-process queue backend. The metadata-rich body is checked after signed Create
and Update, with publisher-context image and long-description URLs, distinct
sender/receiver keys, receiver database reads, and anonymous reader API responses.
The source image bytes remain available and source HTML remains unchanged by
outgoing URL conversion. Nine checks cover the primary flow and rejection paths.

Only the test factory's private-address policy is adapted for loopback peers;
the test also blocks non-loopback fetches. Signatures and timestamps are verified
by the real Fedify implementation. Follower edges are seeded, so this is not a
Follow/Accept handshake test. It does not evaluate public DNS/TLS/proxies,
other implementations, Redis durability/retry recovery, arbitrary remote content,
or browser/assistive-technology behavior. See the fixture's README for its
`CREATEDB` requirement and teardown. Production remains untouched and manual
validation remains skipped; no criterion is signed off by these tests.
Verification: `pnpm fmt`, then `pnpm check --strict` (2,618 unit tests, no
type/lint warnings), and all 339 integration tests across 33 files pass. The
nine signed-federation tests also pass with shuffled order (seed `20261101`).

### Editor transfer edge-case follow-up — 2026-11-01

This test-only follow-up adds 31 ordinary unit/component checks and three
expected-failure cases. It changes no application implementation. The fixtures
exercise forward/backward partial text selections, a backward cross-paragraph
selection, rectangular cell selections, supported metadata at table-cell targets,
rich-caption review, complex spans/headers/captions, and nested-image rehosting.
Delayed uploads and open reviews retain mapped targets through intervening edits;
cancellation, failed uploads, ambiguous image counts, and undo are checked.

Two defects were first reproduced with normal failing tests, then pinned with
`test.fails` rather than fixed on this branch:

- **Colliding destination IDs (paste and drop):** inserting an image plus its
  description into a document that already contains the same description ID
  creates two `id="details"` elements without review. The image can consequently
  reference the existing description instead of the transferred one. The
  source-versus-slice inventory never compares IDs with the destination document.
- **Description outside a copied image selection:** copying only the image from
  a valid image/long-description pair and pasting it into a fresh document retains
  `aria-describedby="details"` but omits its target without review. The inventory
  retains the IDREF string without validating its resolution in the result.

These are three expected-failure cases for two defects, not successful
preservation checks. A copied rectangular table fragment currently triggers an
inventory warning for its clipboard table wrapper; that test does not establish
general detection of dangling header references.

Six additional Chromium checks use native clipboard keyboard actions and a
trusted HTML pointer drop at a table cell. They cover partial replacement,
table-cell metadata, complex tables, image/long-description autosave, caption loss
review, and undo. The autosave fixture only observes HTTP writes against the
isolated loopback API; it does not persist to a database. The two association
defect reproductions are component tests, not native-browser confirmations.

Verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 174 test files, 1,698 ordinary passes
  and three expected failures; no type/lint warnings.
- The three targeted editor suites pass with shuffled order (seed `20261101`):
  114 ordinary passes and three expected failures.
- `pnpm test:accessibility`: 47 named checks pass; jsdom prints its existing
  unavailable-canvas diagnostics.
- `pnpm test:browser`: all 38 Chromium checks pass on an unmodified full rerun.
  The initial full run passed 37 checks but timed out in the existing `ready()`
  helper opening the article navigation menu. Its trace suggests a startup
  hydration race; that cause is not proven or fixed here. All six new scenarios
  passed in both full runs and their targeted run. Chromium 156.0.8078.4 /
  Playwright 1.64.1; the build retains its existing large-chunk advisory.
- `git diff --check` passes.

No production services, data, or native mobile files are changed. Manual
accessibility evaluation remains skipped, and no criterion or WCAG/ATAG
conformance claim is signed off.

### Reference-safe editor transfers — 2026-11-01

The three association pins above were converted to ordinary tests and first
confirmed failing at duplicate IDs and the missing description target. They now
pass with no expected failures. For a unique incoming ID that collides with a
surviving destination ID, the editor chooses an unused `-copy` suffix and updates
the incoming references together. It retains IDs whose original targets are
being replaced, preserving references elsewhere in the article. Source nodes,
marks, caption attributes, slice boundaries, alternatives, and text are retained.

The actual proposed document and the incoming slice are checked for duplicate
IDs and unresolved/ambiguous `aria-labelledby`, `aria-describedby`, `headers`,
and local fragment links. Newly transferred defects cannot hide behind an
identical pre-existing defect. Reference checks run before uploads, when a
structural-simplification review is accepted, and after asynchronous uploads;
collision remapping is recalculated against the current mapped target.

Missing or ambiguous targets open a repair-only review with **Cancel**, not a
button to accept broken relationships. The author can include referenced
descriptions/headers, resolve ambiguous source IDs, or deliberately paste as
plain text. An already completed upload is not undone if intervening edits make
its reference invalid; the guard prevents document insertion, not storage rollback.
Ordinary detected structure loss retains the existing cancel/accept workflow.

The new browser cases also reproduced adjacent transfers sharing an undo group:
one undo removed the remapped transfer and the immediately preceding paste.
Component regressions confirmed this and grouping with a following plain paste.
Handled transfers now close their history group before and after insertion, so
undo preserves neighboring edits. This is not a change to native internal drags.

Verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 175 files and 1,725 passing tests,
  zero expected failures and no type/lint warnings.
- Four targeted editor suites pass with shuffled order (seed `20261101`): 141 tests.
- `pnpm test:accessibility`: 47 named checks pass, with existing jsdom canvas diagnostics.
- `pnpm test:browser`: 42 Chromium checks pass on an unmodified full rerun. The
  first full run passed 41 but hit the same existing article-menu `ready()`
  timeout recorded in the test-only phase; it is not fixed here. The four new
  native-browser cases passed in both full runs after the undo-boundary repair.
  The build retains its existing large-chunk advisory.
- `git diff --check` passes.

Only frontend application code, tests, and this evidence register change. There
are no API/schema/dependency changes, production operations, or mobile changes.
The guard does not establish appropriate descriptions, table-header semantics,
or cross-application equivalence. Internal model drags/copies and stored-content
opening are not covered by this new external-transfer reference guard. Manual
evaluation remains skipped; WCAG/ATAG conformance remains unestablished.

### Browser readiness follow-up — 2026-11-02

Four production-built Chromium regressions hold the first client-script wave for
two seconds on the home, sign-in, article, and composer routes. With the original
`ready()` helper, all four fail at the same missing image-menu item recorded above.
The reproduction traces show clicks completing 1.8–1.9 seconds before the client
scripts are released: visible server-rendered controls are actionable before their
event handlers exist. This reproduces the suspected race; it does not establish
that every historical startup timeout had the same cause.

The helper now polls a real menu interaction within Playwright's existing default
five-second assertion timeout. It retries only this setup probe, avoids toggling
an already visible menu, and waits for dismissal before returning. It does not
raise suite timeouts, retry complete scenarios, or add production readiness hooks.
The delayed-script checks also require menu closure and focus return. A separate
aborted-script case requires a visible but unhydrated page to fail readiness.

Verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 175 files and 1,725 passing tests,
  with no type/lint warnings.
- `pnpm test:browser`: 47 Chromium checks pass without scenario retries, including
  the four delayed-script regressions and the aborted-script failure guard. The
  production build retains its existing large-chunk advisory.
- The four delayed-hydration checks pass with `--repeat-each=5`: 20 successful runs.
- `git diff --check` passes.

Only the browser tests and this evidence register change. No application,
API/schema/dependency, production, or native mobile changes are included. Manual
accessibility evaluation remains skipped; WCAG/ATAG conformance is unestablished.

### Autosave/session recovery browser coverage — 2026-11-02

Seven additional Chromium scenarios exercise the production-built composer with
browser-intercepted writes against the loopback fixture. HTTP 503, an aborted
network request, and HTTP 401 preserve the title and body without redirecting or
moving focus. A subsequent keyboard edit saves the latest HTML/JSON and clears
the failure indicator. Updates must not send publication status or schedule fields.
The 401 case removes and restores only the dummy fixture session cookie, not a
real account's session or an interactive sign-in flow.

An unchanged failed payload retries after the existing 15-second retry delay.
A fresh draft stays without an ID after a rejected create; after acknowledgement,
its next edit updates the returned ID rather than creating again. This does not
prove duplicate prevention when a server commits a write but its response is lost.

Keyboard in-app navigation after a failed save checks modal focus, forward/backward
focus wrapping, **Stay**, focus return, and retained text. Cancelling a real browser
reload prompt also retains the unsaved draft. Shared sign-in/readiness helpers are
extracted unchanged for both browser suites.

No application defect is established by test-harness failures: the initial draft
tests assumed whitespace-free status text, initial focus on **Stay** rather than
the Bits UI dialog container, and completion of a cancelled reload's load event.
The assertions now follow the rendered text and actual dialog/navigation behavior.

Initial CI run `41443737665` passed all jobs, but its browser artifact reported
53 first-attempt passes and one autosave case that passed only on retry. That
attempt inserted setup text at the beginning rather than the intended end; it
did not lose the existing draft text. The append helper now verifies editability
and an end-caret after the focus/selection frame before typing once, retrying only
the positioning key. The cause of the unexpected caret is not established as an
application defect. The new autosave suite disables scenario retries so this kind
of failure cannot produce a green result through a second attempt.

Verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 175 files and 1,725 passing tests,
  with no type/lint warnings.
- The targeted autosave/composer unit suites pass all 34 checks.
- `pnpm test:browser --retries=0`: all 54 Chromium checks pass without scenario retries,
  including the seven new scenarios. No application code changes or expected-failure
  pins are included. The build retains its large-chunk advisory.
- The three failure/recovery cases pass with `--repeat-each=5 --retries=0`: all
  15 runs pass after the caret precondition was added.
- `git diff --check` passes.

The fixture observes HTTP payloads and UI state, not committed storage or real
reauthentication. Recovery after a completed reload, browser crash, or lost create
acknowledgement, other browsers, and assistive-technology announcements remain
unverified. Only tests and this evidence register change; no production or native
mobile operations are included. Manual evaluation remains skipped and no WCAG/ATAG
conformance claim is made.

### Clipboard selection preconditions — 2026-11-02

CI run `41444905360` passed all six jobs, but its browser artifact contained 52
first-attempt passes and two retry-only passes in the existing partial-replacement
and table-cell clipboard checks. All seven new autosave scenarios passed without
retries. The table-cell failure reproduced twice in 30 unmodified local runs.

Read-only capture at the native paste event reproduced another table-cell failure:
the DOM caret was at position 25 (`al|pha`), while ProseMirror's model selection
was still at 23 (`|alpha`). The trusted paste carried the expected HTML but inserted
before `alpha`. The event probe changes no document or selection. This establishes
a selection mismatch in that automated attempt, not a confirmed cause for every
historical failure. The partial-replacement CI failure has not been reproduced
independently in the local diagnostic runs.

The two preservation tests now require an editable, focused editor and agreement
between the DOM and model on the exact intended range/cell. Native positioning
keys advance through rendering frames; only selection setup can be retried. The
native paste runs once, and all original text, metadata, table, and undo assertions
remain unchanged. Paste-event snapshots are retained as test attachments. The
accessibility suite now disables scenario retries, like the autosave suite.

After adding the preconditions, the two cases pass with
`--repeat-each=20 --workers=4 --retries=0`: 40 first-attempt passes. Inspection of
all 40 event attachments confirms one trusted paste per case with aligned DOM
and model selections at the paste event.

Final local verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 175 files and 1,725 tests pass, with
  no type/lint warnings.
- `pnpm test:browser --retries=0`: all 54 Chromium checks pass. The build retains
  its existing large-chunk advisory.
- `git diff --check` passes.

These are tests of preservation after a settled selection. They do not fix or
validate rapid-input selection synchronization in the application itself, nor
establish cross-browser or assistive-technology behavior. No application source,
dependency, production, or native mobile change is included. Manual evaluation
remains skipped; no WCAG/ATAG conformance claim is made.

### Editor toolbar keyboard access — issue #285 — 2026-11-02

The browser regression reproduced the report: with a selected passage in the
article body, Alt+F10 left the Text style control unfocused. A separate regression
also reproduced Ctrl+K not opening the existing Add link dialog. These are
application gaps, unlike the settled-selection test prerequisites above.

Alt+F10 now focuses Text style from the editable body. Escape or Alt+F10 on the
toolbar returns focus through ProseMirror's public view API, retaining its current
selection without editing the document. Dropdown and emoji triggers compose Bits
UI Toolbar.Button so arrow/Home/End navigation includes them. Portalled menus,
popovers, and dialogs keep their own Escape handling before returning to the
toolbar; shortcuts do not apply to unrelated fields or blocked imports.

Ctrl/Command+K uses the existing Link action: it opens Add link for unlinked text
or removes an active link. Existing Tiptap bold, italic, underline, and heading
shortcuts are unchanged. Visible navigation help is associated with the toolbar
and body; the accessibility guidance lists formatting shortcuts as well.

Browser coverage checks text-range restoration, toolbar activation on the selected
passage, dropdown/dialog/popover dismissal, contextual table controls, ordinary
Tab navigation, unrelated title focus, link cancellation/insertion/removal, and
existing formatting/heading shortcuts. Component coverage also checks backward,
image-node, and multi-cell selections, composition/modifier guards, already-handled
Escape, blocked imports, and both Control and Meta link modifiers.

Verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 175 files and 1,745 tests pass,
  with no type/lint warnings.
- The seven new browser scenarios pass with
  `--repeat-each=10 --workers=4 --retries=0`: 70 first-attempt passes.
- `pnpm test:browser --retries=0`: all 61 Chromium scenarios pass. Artifact
  inspection confirms one result per test, no failures/flaky/skipped cases, and
  aligned selections in both existing native clipboard probes. The build retains
  its existing large-chunk advisory.
- The first expanded browser run had 60 passes and one test locator error
  (`Add row below` instead of the existing `Row below`). Only that selector
  changed for this failure; no application behavior was changed to fit the test.
- `git diff --check` passes.

This does not resolve the rapid selection/paste mismatch or establish screen-reader
behavior or cross-browser/platform shortcut availability. Manual evaluation remains
skipped, native mobile accessibility remains out of scope, and no WCAG/ATAG
conformance claim is made. No dependencies, API contracts, schemas, or production
services change.

### Rapid selection/paste synchronization — 2026-11-02

An independent Chromium regression omitted the settled-selection prerequisites
from the existing preservation checks. In 60 no-retry attempts it produced two
failures. One pinned an insertion defect: the trusted paste saw DOM range 7–10
(`bod`) but model range 7–8 (`b`), and left `ody` instead of `y`. The other also
had an unexpected DOM range (`od`, not `bod`); that positioning discrepancy is
not evidence that the same insertion fix resolves every rapid navigation issue.

A deterministic component regression reproduced the `ody` result before the
fix, then passed unchanged afterward. The editor now dispatches a standard
`selectionchange` notification from its pre-parse paste hook, allowing the
existing ProseMirror selection observer to read pending DOM selection/mutations
before clipboard parsing chooses its context and insertion captures a bookmark.
It does not reconstruct selections, access private observer APIs, replace the
paste parser, or change dependencies. It skips read-only/composing/unfocused
editors, already-handled events, and events received while a review is open.

Component checks cover forward/backward ranges, a collapsed caret, destination
table metadata and undo, a pending code-block context, loss-review cancellation,
image-node and rectangular-cell selections, and the notification guards. These
use synthetic DOM paste events in jsdom, not trusted browser clipboard events.

`tests/browser/rapid-paste.spec.ts` isolates the timing-sensitive final move:
only its starting range settles, then one native arrow/selection-extension key
is immediately followed by native paste, with no intervening frame wait,
selection read, setup retry, or assertion. It covers forward/backward replacement
and a table caret, retains metadata/table/undo assertions, and disables scenario
retries. All 90 attempts passed with `--repeat-each=30 --workers=4 --retries=0`.
Read-only capture before the new hook found 21 DOM/model mismatches in those
passing attempts; each contained exactly one trusted paste. Thus the checks
exercise pending selections rather than merely waiting for the race to vanish.

Verification with Node 26.7.0 / pnpm 12.16.1:

- `pnpm fmt`, then `pnpm check --strict`: 175 files and 1,758 tests pass,
  with no type/lint warnings (13 new component regressions).
- `pnpm test:browser --retries=0`: all 64 Chromium scenarios pass. Report
  inspection confirms 64 single attempts, with no failures/flaky/skipped cases.
- The repeated rapid-paste run has 90 single attempts and no failures/flaky/skipped
  cases. Its 21 pre-handler mismatches include forward, backward, and table targets.
- `git diff --check` passes. The build retains its existing large-chunk advisory.

This addresses the reproduced stale-model paste defect, not every browser
selection/navigation discrepancy. Cross-browser/platform and assistive-technology
behavior remain unverified. Manual evaluation remains skipped, native mobile
accessibility is excluded, and no WCAG/ATAG conformance claim is made. No API,
schema, backend, dependency, or production change is included.

## Transformation inventory and remaining preservation checks

This is a source-path inventory, not proof that each transformation preserves
every applicable accessibility property. The import warning is a guard on
opening a rich editor, not a replacement for end-to-end pipeline tests.
Frontend paths below are relative to `apps/frontend/src/lib/`; backend paths
are relative to `apps/backend/src/`.

| Path                                   | Implementation / available evidence                                                                                      | Still needed                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Rich HTML/JSON editing                 | `editor/extensions.ts`, `content-accessibility.ts`; round trips include caption metadata and complex table spans/headers | Arbitrary nesting/tables, rich captions, MathML; detection is inventory-based                           |
| Open imported HTML                     | `editor/Editor.svelte`, `contentLoss.ts`; component and browser autosave regression                                      | Attribute relocation/meaning changes, all supported imported formats                                   |
| Clipboard HTML and text                | Parsed-slice review, partial/cell selections, ID remapping and result-reference guard; native Chromium and undo checks    | Cross-application formats, arbitrary selections/tables, header semantics and semantic loss             |
| Clipboard image files                  | Rehosting retains attributes/text and bundled long descriptions; missing targets wait for repair before insertion       | Multi-image associations, other browsers, optimized meaning, storage rollback after a late guard      |
| Drag/drop                              | Shared review, mapped targets, ID remapping/rehosting; component and trusted-pointer table-cell fixtures                  | Internal-copy ID collisions, OS/application payloads, arbitrary selections and assistive technologies |
| Image optimization / crop              | `editor/image.ts`, `components/AvatarCropper.svelte`; image/crop tests                                                   | Meaning after crop/downscale, animation and embedded metadata evaluation                               |
| Profile / instance Markdown            | Backend `lib/markdown.ts` then `lib/sanitize.ts`; Markdown/sanitizer tests                                               | Representative mixed languages, tables, MathML and preview/save equality                               |
| API post create/update                 | Backend `services/posts.ts` then sanitizer; real-session HTTP/store/read/edit fixture in all publication states           | Other payloads, editor JSON consistency, browser-to-API workflows                                        |
| Webhook publishing                     | Backend `services/webhooks.ts`, Markdown/sanitizer                                                                       | Metadata-rich webhook fixtures and scheduled publication                                               |
| Import parsing                         | Backend `lib/contentArchive.ts`; native, Medium, Substack, WordPress and RSS fixtures through real HTTP/storage            | Format-specific article-language fields, other markup and sanitizer-loss assessment                    |
| Import persistence / export            | Real SQL/files, byte/metadata checks, native multi-hop and WordPress re-import, offline HTML, retries and failure paths   | Format-specific metadata beyond the fixture, rendered meaning                                         |
| Federation outbound                    | Real queued Create/Update HTTP delivery between isolated processes; publisher-context URLs, signatures and metadata    | Public DNS/TLS/proxies, other receivers, Redis retry durability, unsupported content                    |
| Federation inbound                     | Signed inbox receipt, real SQL and reader API fixture; unsigned/wrong-signer/modified/stale and restricted rejection    | Other implementations, Follow/Accept handshake, arbitrary remote content                               |
| Reader image proxy / code highlighting | Frontend `imageProxy.ts`, `bodyImages.ts`, `highlight.ts`; helper tests                                                  | Combined rendered page, alternative-language/reference consistency                                     |
| Personal image visibility              | `imageDisplay.svelte.ts`, `actions/imageDescriptions.ts`; component/browser tests                                        | All editor/preview variants and assistive technologies; saved content must remain unchanged            |

## WCAG 2.2 A/AA criterion register

Every row is **pending evaluation**. The final column identifies useful existing
evidence or the next verification, not a conformance result.

| Criterion                                                  | Level | Evidence / required evaluation                                                  |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content                                     | A     | Alternatives, decorative choices; manually assess all images and controls       |
| 1.2.1 Audio-only and Video-only (Prerecorded)              | A     | Determine applicability across all supported content                            |
| 1.2.2 Captions (Prerecorded)                               | A     | Determine applicability; do not infer from absent editor controls               |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A     | Determine applicability                                                         |
| 1.2.4 Captions (Live)                                      | AA    | Determine applicability                                                         |
| 1.2.5 Audio Description (Prerecorded)                      | AA    | Determine applicability                                                         |
| 1.3.1 Info and Relationships                               | A     | Header/caption round trips, detail-list regression; full semantics review       |
| 1.3.2 Meaningful Sequence                                  | A     | Manual reading-order and linearized-content checks                              |
| 1.3.3 Sensory Characteristics                              | A     | Writing guidance; assess instructions throughout the app                        |
| 1.3.4 Orientation                                          | AA    | Real-device/browser portrait and landscape checks                               |
| 1.3.5 Identify Input Purpose                               | AA    | Inspect personal-data autocomplete across forms                                 |
| 1.4.1 Use of Color                                         | A     | Assess statuses, charts, errors, links, and author content                      |
| 1.4.2 Audio Control                                        | A     | Determine applicability across all routes/content                               |
| 1.4.3 Contrast (Minimum)                                   | AA    | Real-browser contrast in both themes and all states                             |
| 1.4.4 Resize Text                                          | AA    | 200% text/zoom checks with no loss of functionality                             |
| 1.4.5 Images of Text                                       | AA    | Writing guidance and manual review of generated content                         |
| 1.4.10 Reflow                                              | AA    | 320 CSS-pixel equivalent; review permitted two-dimensional exceptions           |
| 1.4.11 Non-text Contrast                                   | AA    | Controls, focus indicators, charts, and boundaries in both themes               |
| 1.4.12 Text Spacing                                        | AA    | Apply the criterion's spacing overrides to every layout                         |
| 1.4.13 Content on Hover or Focus                           | AA    | Tooltips/popovers: dismissible, hoverable, persistent                           |
| 2.1.1 Keyboard                                             | A     | Editor/tag/crop tests; complete all workflows using a keyboard                  |
| 2.1.2 No Keyboard Trap                                     | A     | Manually enter and leave every popup and editing surface                        |
| 2.1.4 Character Key Shortcuts                              | A     | Inventory shortcuts and determine applicable controls                           |
| 2.2.1 Timing Adjustable                                    | A     | Session expiry, authentication, transient UI, scheduled workflows               |
| 2.2.2 Pause, Stop, Hide                                    | A     | Image display hide preference; evaluate every surface and auto-updating content |
| 2.3.1 Three Flashes or Below Threshold                     | A     | Content inventory and flashing-media policy/controls                            |
| 2.4.1 Bypass Blocks                                        | A     | Skip-target regression; verify activation and focus in browsers                 |
| 2.4.2 Page Titled                                          | A     | Existing page-title handling; verify every route/state                          |
| 2.4.3 Focus Order                                          | A     | Complete workflows, responsive navigation, and portal focus                     |
| 2.4.4 Link Purpose (In Context)                            | A     | Link-name tests and writing guidance; manual context checks                     |
| 2.4.5 Multiple Ways                                        | AA    | Search/navigation inventory and complete page set                               |
| 2.4.6 Headings and Labels                                  | AA    | Named editor/controls; evaluate all labels and heading structure                |
| 2.4.7 Focus Visible                                        | AA    | Shared CSS; real-browser visible-focus checks                                   |
| 2.4.11 Focus Not Obscured (Minimum)                        | AA    | Sticky navigation, dialogs, mobile rails, scroll containers                     |
| 2.5.1 Pointer Gestures                                     | A     | Evaluate all multipoint/path-dependent input                                    |
| 2.5.2 Pointer Cancellation                                 | A     | Check activation/cancellation of every custom pointer interaction               |
| 2.5.3 Label in Name                                        | A     | Visible control text versus computed accessible names                           |
| 2.5.4 Motion Actuation                                     | A     | Determine applicability                                                         |
| 2.5.7 Dragging Movements                                   | AA    | Image width and crop buttons; inventory other dragging features                 |
| 2.5.8 Target Size (Minimum)                                | AA    | Real-browser geometry and documented exceptions                                 |
| 3.1.1 Language of Page                                     | A     | Existing page-language handling; multilingual reading/auth UI                   |
| 3.1.2 Language of Parts                                    | AA    | Passage tool and metadata round trips; manual pronunciation checks              |
| 3.2.1 On Focus                                             | A     | Review navigation and focus-triggered actions                                   |
| 3.2.2 On Input                                             | A     | Filters, tag commits, selectors, and other input-triggered changes              |
| 3.2.3 Consistent Navigation                                | AA    | Compare navigation across routes and responsive layouts                         |
| 3.2.4 Consistent Identification                            | AA    | Compare repeated controls and icons                                             |
| 3.2.6 Consistent Help                                      | A     | Review placement/order of repeated help mechanisms                              |
| 3.3.1 Error Identification                                 | A     | Selected alert regressions; every failure/validation state                      |
| 3.3.2 Labels or Instructions                               | A     | Explicit authoring labels and guide; all inputs and required fields             |
| 3.3.3 Error Suggestion                                     | AA    | Invalid language/width feedback; all form errors                                |
| 3.3.4 Error Prevention (Legal, Financial, Data)            | AA    | Confirmations, reversible edits, deletion and import workflows                  |
| 3.3.7 Redundant Entry                                      | A     | Complete multi-step setup/authentication/publishing processes                   |
| 3.3.8 Accessible Authentication (Minimum)                  | AA    | Password managers, paste, passkeys, recovery, bot challenges                    |
| 4.1.2 Name, Role, Value                                    | A     | Axe and component regressions; screen-reader verification                       |
| 4.1.3 Status Messages                                      | AA    | Upload/status regressions; all asynchronous success/error states                |

WCAG 2.2 removed 4.1.1 Parsing. Record any legacy WCAG 2.0 assessment separately
when preparing an ATAG claim.

## ATAG 2.0 A/AA criterion register

Every included criterion remains **pending evaluation**. Native-platform
criteria are outside the chosen web-only scope, not a claim about mobile.
Criteria whose level follows WCAG must be assessed against A and AA for this target.

| Criterion                                                        | Evidence / required evaluation                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A.1.1.1 Web-Based Accessible (WCAG)                              | Complete the WCAG register and full-process evaluation                               |
| A.1.2.1 Accessibility Guidelines                                 | Native user interfaces outside this evaluation                                       |
| A.1.2.2 Platform Accessibility Services                          | Native user interfaces outside this evaluation                                       |
| A.2.1.1 Text Alternatives for Rendered Non-Text Content          | Editor/image-language tests; assistive-technology checks                             |
| A.2.1.2 Alternatives for Rendered Time-Based Media               | Determine applicability and preview behavior                                         |
| A.2.2.1 Editing-View Status Indicators                           | Formatting states and review count; inventory all indicators                         |
| A.2.2.2 Access to Rendered Text Properties                       | Semantic markup and formatting-state tests; manual inspection                        |
| A.3.1.1 Keyboard Access (Minimum)                                | Complete authoring workflows with keyboard only                                      |
| A.3.1.2 No Keyboard Traps                                        | Editing surfaces, dialogs, popovers, and preview                                     |
| A.3.1.3 Efficient Keyboard Access                                | Toolbar navigation, document navigation, and search                                  |
| A.3.2.1 Auto-Save (Minimum)                                      | Existing draft autosave; evaluate expired-session behavior                           |
| A.3.2.2 Timing Adjustable                                        | Inventory time limits and document applicable exceptions                             |
| A.3.2.3 Static Input Components                                  | Reduced-motion CSS; verify all input components                                      |
| A.3.3.1 Static View Option                                       | Persisted image hiding; evaluate every preview and editing view                      |
| A.3.4.1 Navigate By Structure                                    | Document-element navigator; assess every editing view                                |
| A.3.5.1 Text Search                                              | Forward/backward search of body, image alternatives, captions; assess Markdown views |
| A.3.6.1 Independence of Display                                  | Theme/platform settings versus stored content                                        |
| A.3.6.2 Save Settings                                            | Existing persisted preferences; inventory authoring settings                         |
| A.3.6.3 Apply Platform Settings                                  | System theme/reduced motion; evaluate forced colours and other settings              |
| A.3.7.1 Preview (Minimum)                                        | Browser-rendered profile preview; inventory every preview                            |
| A.4.1.1 Content Changes Reversible (Minimum)                     | Undo tests and existing confirmations; every authoring action                        |
| A.4.1.2 Settings Change Confirmation                             | Reversible preferences and destructive settings                                      |
| A.4.2.1 Describe Accessibility Features                          | In-product guide/control instructions; complete feature inventory                    |
| A.4.2.2 Document All Features                                    | Documentation-site and in-product documentation review                               |
| B.1.1.1 Content Auto-Generation After Authoring Sessions (WCAG)  | Generated pages, scheduled posts, and federation                                     |
| B.1.1.2 Content Auto-Generation During Authoring Sessions (WCAG) | Defaults, inserted tables/images, and review prompts                                 |
| B.1.2.1 Restructuring and Recoding Transformations (WCAG)        | Tested metadata round trips; remaining transformations listed above                  |
| B.1.2.2 Copy-Paste Inside Authoring Tool (WCAG)                  | Complete copy/paste transformation matrix                                            |
| B.1.2.3 Optimizations Preserve Accessibility                     | Sanitizer/image optimization tests; remaining metadata inventory                     |
| B.1.2.4 Text Alternatives for Non-Text Content are Preserved     | Image tests; arbitrary markup/import/export assessment                               |
| B.2.1.1 Accessible Content Possible (WCAG)                       | Language, alternatives, tables; evaluate supported HTML restrictions                 |
| B.2.2.1 Accessible Option Prominence (WCAG)                      | Headings/header defaults; manual prominence review                                   |
| B.2.2.2 Setting Accessibility Properties (WCAG)                  | Image/language/table controls; complex relationships assessment                      |
| B.2.3.1 Alternative Content is Editable (WCAG)                   | Alt-text dialog and search; all non-text content                                     |
| B.2.3.2 Automating Repair of Text Alternatives                   | No invented descriptions; assess stock-photo descriptions/defaults                   |
| B.2.4.1 Accessible Template Options (WCAG)                       | Determine applicability to fixed layouts/templates                                   |
| B.2.4.2 Identify Template Accessibility                          | Determine applicability to template selection                                        |
| B.2.4.3 Author-Created Templates                                 | Determine applicability                                                              |
| B.2.5.1 Accessible Pre-Authored Content Options                  | Stock-photo and other pre-authored content assessment                                |
| B.2.5.2 Identify Pre-Authored Content Accessibility              | Stock-photo and other selection mechanisms                                           |
| B.3.1.1 Checking Assistance (WCAG)                               | Advisory checker plus manual guidance; establish complete applicable coverage        |
| B.3.1.2 Help Authors Decide                                      | Decision instructions in review and writing guide                                    |
| B.3.1.3 Help Authors Locate                                      | Review buttons and document positions; manual check coverage                         |
| B.3.1.4 Status Report                                            | Live review list/count; evaluate scope/accuracy of reporting                         |
| B.3.1.5 Programmatic Association of Results                      | Issues refer to document positions; evaluate assistive-technology association        |
| B.3.2.1 Repair Assistance (WCAG)                                 | Review-to-settings flows plus manual instructions                                    |
| B.4.1.1 Features Active by Default                               | Review runs on document changes; visible count and image indicators                  |
| B.4.1.2 Option to Reactivate Features                            | No disable option for current checking/guidance                                      |
| B.4.1.3 Feature Deactivation Warning                             | Determine applicability; no current checking disable option                          |
| B.4.1.4 Feature Prominence                                       | Compare all content-support features with other checking tools                       |
| B.4.2.1 Model Practice (WCAG)                                    | Documentation examples and snippets require review                                   |
| B.4.2.2 Feature Instructions                                     | In-product guidance implemented; user-facing docs update pending                     |

## Manual verification and release gate

Use disposable accounts/content on a test instance. Do not run integration tests
or destructive accessibility experiments against production data.

1. Record the tested commit, instance configuration, browser/OS versions,
   assistive technology versions, account roles, and representative content.
2. Test signed-out reading, registration/login/recovery, setup, reading lists,
   social actions, draft/published/scheduled editing, image upload/crop, search,
   content portability, settings, moderation, and administration.
3. Use a real keyboard and screen reader, including Firefox with NVDA on
   Windows and Safari with VoiceOver on macOS, or explicitly document the
   supported/tested combinations and omissions. Test speech input and touch
   alternatives for custom interactions.
4. Exercise both themes, system/reduced-motion/forced-colour preferences,
   200% text enlargement, 400% browser zoom, 320 CSS-pixel equivalent reflow,
   text-spacing overrides, and narrow portrait/landscape layouts.
5. Exercise populated/empty/loading/error/success/disabled states, all menus,
   dialogs, tooltips, focus return, validation, session expiry, and bot challenges.
6. Evaluate content round trips with meaningful/decorative images, mixed
   languages/directions, complex tables, long descriptions, MathML, imported
   HTML, clipboard operations, exports, and federated content.
7. Attach criterion-level evidence, applicability decisions, limitations, and
   remaining failures. Do not publish an AA claim until every applicable
   requirement and complete process in the stated scope passes.
