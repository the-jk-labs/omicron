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

### Limits of these checks

The component environment is jsdom, with no real layout, painted colours, or
assistive-technology integration. The axe helper disables colour-contrast
analysis for that reason. It cannot establish contrast, target geometry, zoom,
reflow, focus visibility/occlusion, text-spacing resilience, or screen-reader
usability. Hidden states, dialogs, failures, and populated data require further
coverage beyond the included fixtures. A clean axe result is not a WCAG pass.

The authoring review is deliberately advisory. Heading-order and caption prompts
are not automatic declarations of WCAG failure. The checker does not invent alt
text, block publication, or guarantee that descriptions and relationships are
correct. The writing guide supplies manual review instructions alongside it.

## Open implementation/evaluation work

- Inventory and test every transformation: clipboard, rich editing, Markdown,
  import/export, API/webhook publishing, and federation. Supported editor nodes
  now preserve tested metadata; arbitrary allowed HTML, MathML, rich captions,
  and unsupported structures still need a loss-preservation/warning assessment.
- Evaluate animated images and provide a suitable pause/stop/hide mechanism
  wherever required. Reduced-motion CSS does not stop animated GIFs.
- Complete real-browser checks of both themes, narrow screens, browser zoom,
  text spacing, forced colours, and all controls' non-text contrast/target size.
- Evaluate whole keyboard and screen-reader workflows, including modal focus
  return, authentication/recovery, autosave/session expiry, publishing,
  scheduling, import, moderation, and third-party bot protection.
- Complete ATAG applicability, documentation/examples, stock-photo/pre-authored
  content, and manual-checking coverage assessments. The separate user-facing
  documentation site has not been changed by this implementation.

## Local verification record

Verified on 2026-10-31 with Node 26.7.0 and pnpm 12.16.1:

- Backend: `pnpm fmt`, then `pnpm check --strict`; 139 test files and 2,603 unit tests pass.
- Frontend: `pnpm fmt`, then `pnpm check --strict`; 169 test files and 1,610 tests pass, with no type/lint warnings.
- Frontend: `pnpm test:accessibility`; 46 named checks pass across 32 test files.
- Frontend: `pnpm build` succeeds; Vite reports a large-chunk advisory.
- `git diff --check` passes.

Database integration tests, deployed-instance checks, real-browser accessibility
testing, and screen-reader evaluation were not run. The separate accessibility
test command can print jsdom canvas diagnostics; canvas measurement is unavailable
in that environment and is not evidence of passing visual checks.

## WCAG 2.2 A/AA criterion register

Every row is **pending evaluation**. The final column identifies useful existing
evidence or the next verification, not a conformance result.

| Criterion                                                  | Level | Evidence / required evaluation                                            |
| ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------- |
| 1.1.1 Non-text Content                                     | A     | Alternatives, decorative choices; manually assess all images and controls |
| 1.2.1 Audio-only and Video-only (Prerecorded)              | A     | Determine applicability across all supported content                      |
| 1.2.2 Captions (Prerecorded)                               | A     | Determine applicability; do not infer from absent editor controls         |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A     | Determine applicability                                                   |
| 1.2.4 Captions (Live)                                      | AA    | Determine applicability                                                   |
| 1.2.5 Audio Description (Prerecorded)                      | AA    | Determine applicability                                                   |
| 1.3.1 Info and Relationships                               | A     | Header/caption round trips, detail-list regression; full semantics review |
| 1.3.2 Meaningful Sequence                                  | A     | Manual reading-order and linearized-content checks                        |
| 1.3.3 Sensory Characteristics                              | A     | Writing guidance; assess instructions throughout the app                  |
| 1.3.4 Orientation                                          | AA    | Real-device/browser portrait and landscape checks                         |
| 1.3.5 Identify Input Purpose                               | AA    | Inspect personal-data autocomplete across forms                           |
| 1.4.1 Use of Color                                         | A     | Assess statuses, charts, errors, links, and author content                |
| 1.4.2 Audio Control                                        | A     | Determine applicability across all routes/content                         |
| 1.4.3 Contrast (Minimum)                                   | AA    | Real-browser contrast in both themes and all states                       |
| 1.4.4 Resize Text                                          | AA    | 200% text/zoom checks with no loss of functionality                       |
| 1.4.5 Images of Text                                       | AA    | Writing guidance and manual review of generated content                   |
| 1.4.10 Reflow                                              | AA    | 320 CSS-pixel equivalent; review permitted two-dimensional exceptions     |
| 1.4.11 Non-text Contrast                                   | AA    | Controls, focus indicators, charts, and boundaries in both themes         |
| 1.4.12 Text Spacing                                        | AA    | Apply the criterion's spacing overrides to every layout                   |
| 1.4.13 Content on Hover or Focus                           | AA    | Tooltips/popovers: dismissible, hoverable, persistent                     |
| 2.1.1 Keyboard                                             | A     | Editor/tag/crop tests; complete all workflows using a keyboard            |
| 2.1.2 No Keyboard Trap                                     | A     | Manually enter and leave every popup and editing surface                  |
| 2.1.4 Character Key Shortcuts                              | A     | Inventory shortcuts and determine applicable controls                     |
| 2.2.1 Timing Adjustable                                    | A     | Session expiry, authentication, transient UI, scheduled workflows         |
| 2.2.2 Pause, Stop, Hide                                    | A     | Animated images and any automatically updating content                    |
| 2.3.1 Three Flashes or Below Threshold                     | A     | Content inventory and flashing-media policy/controls                      |
| 2.4.1 Bypass Blocks                                        | A     | Skip-target regression; verify activation and focus in browsers           |
| 2.4.2 Page Titled                                          | A     | Existing page-title handling; verify every route/state                    |
| 2.4.3 Focus Order                                          | A     | Complete workflows, responsive navigation, and portal focus               |
| 2.4.4 Link Purpose (In Context)                            | A     | Link-name tests and writing guidance; manual context checks               |
| 2.4.5 Multiple Ways                                        | AA    | Search/navigation inventory and complete page set                         |
| 2.4.6 Headings and Labels                                  | AA    | Named editor/controls; evaluate all labels and heading structure          |
| 2.4.7 Focus Visible                                        | AA    | Shared CSS; real-browser visible-focus checks                             |
| 2.4.11 Focus Not Obscured (Minimum)                        | AA    | Sticky navigation, dialogs, mobile rails, scroll containers               |
| 2.5.1 Pointer Gestures                                     | A     | Evaluate all multipoint/path-dependent input                              |
| 2.5.2 Pointer Cancellation                                 | A     | Check activation/cancellation of every custom pointer interaction         |
| 2.5.3 Label in Name                                        | A     | Visible control text versus computed accessible names                     |
| 2.5.4 Motion Actuation                                     | A     | Determine applicability                                                   |
| 2.5.7 Dragging Movements                                   | AA    | Image width and crop buttons; inventory other dragging features           |
| 2.5.8 Target Size (Minimum)                                | AA    | Real-browser geometry and documented exceptions                           |
| 3.1.1 Language of Page                                     | A     | Existing page-language handling; multilingual reading/auth UI             |
| 3.1.2 Language of Parts                                    | AA    | Passage tool and metadata round trips; manual pronunciation checks        |
| 3.2.1 On Focus                                             | A     | Review navigation and focus-triggered actions                             |
| 3.2.2 On Input                                             | A     | Filters, tag commits, selectors, and other input-triggered changes        |
| 3.2.3 Consistent Navigation                                | AA    | Compare navigation across routes and responsive layouts                   |
| 3.2.4 Consistent Identification                            | AA    | Compare repeated controls and icons                                       |
| 3.2.6 Consistent Help                                      | A     | Review placement/order of repeated help mechanisms                        |
| 3.3.1 Error Identification                                 | A     | Selected alert regressions; every failure/validation state                |
| 3.3.2 Labels or Instructions                               | A     | Explicit authoring labels and guide; all inputs and required fields       |
| 3.3.3 Error Suggestion                                     | AA    | Invalid language/width feedback; all form errors                          |
| 3.3.4 Error Prevention (Legal, Financial, Data)            | AA    | Confirmations, reversible edits, deletion and import workflows            |
| 3.3.7 Redundant Entry                                      | A     | Complete multi-step setup/authentication/publishing processes             |
| 3.3.8 Accessible Authentication (Minimum)                  | AA    | Password managers, paste, passkeys, recovery, bot challenges              |
| 4.1.2 Name, Role, Value                                    | A     | Axe and component regressions; screen-reader verification                 |
| 4.1.3 Status Messages                                      | AA    | Upload/status regressions; all asynchronous success/error states          |

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
| A.3.3.1 Static View Option                                       | Animated-content handling remains open                                               |
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
