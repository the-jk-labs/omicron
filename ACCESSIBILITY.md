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
  Cross-application transfer formats, partial selections, table-cell drops, and
  operating-system file-manager drags still need evaluation.
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

Database integration tests were not run locally. The separate accessibility
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

## Transformation inventory and remaining preservation checks

This is a source-path inventory, not proof that each transformation preserves
every applicable accessibility property. The import warning is a guard on
opening a rich editor, not a replacement for end-to-end pipeline tests.
Frontend paths below are relative to `apps/frontend/src/lib/`; backend paths
are relative to `apps/backend/src/`.

| Path                                   | Implementation / available evidence                                                                                      | Still needed                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Rich HTML/JSON editing                 | `editor/extensions.ts`, `content-accessibility.ts`; extension round-trip tests                                           | Arbitrary nesting, rich captions, complex tables, MathML; detection is inventory-based                 |
| Open imported HTML                     | `editor/Editor.svelte`, `contentLoss.ts`; component and browser autosave regression                                      | Attribute relocation/meaning changes, all supported imported formats                                   |
| Clipboard HTML and text                | `editor/content-transfer.ts`, `Editor.svelte`; parsed-slice review, cancellation/undo, native Chromium paste tests       | Cross-application formats, partial selections, complex tables and complete semantic loss detection     |
| Clipboard image files                  | Single-file rehosting retains attributes/text; ambiguous associations fail without writes                                | Multi-image associations, other browsers, meaning after image optimization                             |
| Drag/drop                              | Shared content-transfer review, mapped insertion positions, description-preserving rehosting; unit/pointer-browser tests | OS/application payloads, table-cell drops, complex selections, and full assistive-technology workflows |
| Image optimization / crop              | `editor/image.ts`, `components/AvatarCropper.svelte`; image/crop tests                                                   | Meaning after crop/downscale, animation and embedded metadata evaluation                               |
| Profile / instance Markdown            | Backend `lib/markdown.ts` then `lib/sanitize.ts`; Markdown/sanitizer tests                                               | Representative mixed languages, tables, MathML and preview/save equality                               |
| API post create/update                 | Backend `services/posts.ts` then sanitizer; post service tests                                                           | Accessibility-rich payloads through complete HTTP/store/read cycle                                     |
| Webhook publishing                     | Backend `services/webhooks.ts`, Markdown/sanitizer                                                                       | Metadata-rich webhook fixtures and scheduled publication                                               |
| Import parsing                         | Backend `lib/contentArchive.ts`; native, Medium, Substack, WordPress and RSS accessibility-rich fixtures                 | Format-specific article-language fields, other markup and sanitizer-loss assessment                    |
| Import persistence / export            | Backend `services/contentPortability.ts`; repository-mocked native/HTML/WordPress/re-import fixture                      | Real database/media storage, format-specific metadata beyond the fixture                               |
| Federation outbound                    | Backend `federation/article.ts`, `lib/absoluteContentUrls.ts`; absolute body references and JSON-LD metadata fixture     | Signed HTTP delivery, other receiving implementations, unsupported content                             |
| Federation inbound                     | Backend `federation/mod.ts` and `remote.ts`; decoded Create/Update/outbox metadata fixtures                              | Signed inbox HTTP, database-backed storage/read cycles, arbitrary remote content                       |
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
