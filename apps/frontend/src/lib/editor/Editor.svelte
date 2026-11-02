<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { type Content, Editor, generateJSON } from "@tiptap/core";
  import { Placeholder } from "@tiptap/extension-placeholder";
  import { closeHistory } from "@tiptap/pm/history";
  import type { Node as DocumentNode, Slice } from "@tiptap/pm/model";
  import { Selection, type SelectionBookmark } from "@tiptap/pm/state";
  import { dropPoint } from "@tiptap/pm/transform";
  import { Checkbox, Collapsible, Dialog, DropdownMenu, Label, Select, Toolbar } from "bits-ui";
  import { onDestroy, onMount, untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import { CODE_LANGUAGES, codeLanguageLabel } from "#lib/codeLanguages.js";
  import AccessibilityGuidance from "#lib/components/AccessibilityGuidance.svelte";
  import EmojiTrigger from "#lib/components/EmojiTrigger.svelte";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { countWords, readTimeFromWords } from "#lib/format.js";
  import { proxyImageHtml } from "#lib/imageProxy.js";
  import { checkAccessibility, type AccessibilityIssue } from "./check-accessibility";
  import { remapTransferIds, transferReferenceProblems } from "./content-references";
  import {
    fileTransferSlice,
    preserveTransferBoundaries,
    rehostTransferImages,
    transferImageCount,
    transferLoss,
  } from "./content-transfer";
  import { contentLoss } from "./contentLoss";
  import EditorNavigation from "./EditorNavigation.svelte";
  import { extensions } from "./extensions";
  import { isAcceptedImage, prepareImage } from "./image";
  import { focusElement, type TextMatch } from "./navigation";
  import PassageLanguage from "./PassageLanguage.svelte";
  import { EDIT_ALT_EVENT, type EditAltDetail } from "./resizable-image";

  // Isolated Tiptap integration. The parent receives content via `onUpdate`.
  // Server-rendered: the toolbar and a static copy of the body (`previewHtml`)
  // show at once, and Tiptap takes over the body on mount.
  //
  // `content` is Tiptap's native JSON (ProseMirror doc) when the post has one,
  // and the post's stored HTML otherwise. Both rehydrate the same document —
  // see `initialContent` below for why a string needs converting first.
  let {
    onUpdate,
    placeholder = "Write your article…",
    content,
    previewHtml = "",
  }: {
    onUpdate: (html: string, json: unknown) => void;
    placeholder?: string;
    content?: Content;
    /** The body as stored HTML, shown until Tiptap mounts. */
    previewHtml?: string;
  } = $props();
  // Read once: after mount the live editor owns the body.
  const preview = untrack(() => proxyImageHtml(previewHtml));
  let mounted = $state(false);
  let importLosses = $state<string[]>([]);
  let importAcknowledged = $state(false);
  const importBlocked = $derived(importLosses.length > 0 && !importAcknowledged);

  let element = $state<HTMLDivElement | null>(null);
  let editor = $state.raw<Editor>(undefined!);
  let toolbar = $state<HTMLDivElement | null>(null);
  const id = $props.id();
  const keyboardHelpId = `${id}-keyboard-help`;

  function isToolbarShortcut(event: KeyboardEvent) {
    return event.key === "F10" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  }

  function editorKeydown(_view: Editor["view"], event: KeyboardEvent) {
    if (event.defaultPrevented || !editor.isEditable || event.isComposing) return false;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
      toggleLink();
      return true;
    }
    if (!isToolbarShortcut(event)) return false;
    const first = toolbar?.querySelector<HTMLButtonElement>("[data-toolbar-item]:not(:disabled)");
    if (!first) return false;
    first.focus();
    return true;
  }

  function toolbarKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || !editor?.isEditable) return;
    const escape = event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (!escape && !isToolbarShortcut(event)) return;
    event.preventDefault();
    editor.view.focus();
  }

  // The status line every desktop editor has: how much is there, and how long
  // it will take to read. Recomputed from the document itself rather than from
  // the serialized HTML, so markup never inflates the count.
  //
  // Only on a document change, never on a bare cursor move — `onTransaction`
  // fires for every arrow key, and walking the whole document that often buys
  // nothing that changes on screen.
  let stats = $state({ characters: 0, words: 0, minutes: 0 });
  let issues = $state<AccessibilityIssue[]>([]);
  let checksOpen = $state(false);
  let documentNode = $state.raw<DocumentNode | null>(null);

  function refreshStats(ed: Editor) {
    // One newline per block, so paragraphs are counted as separated rather than
    // running the last word of one into the first of the next. Those newlines
    // are the counter's own doing, not the author's, so they are dropped again
    // before counting characters — a document nested in lists or table cells
    // carries a separator per level and would otherwise report characters
    // nobody typed.
    const text = ed.getText({ blockSeparator: "\n" });
    const words = countWords(text);
    const characters = text.replace(/\n/g, "").length;
    stats = { characters, words, minutes: words ? readTimeFromWords(words) : 0 };
    issues = checkAccessibility(ed.state.doc);
    documentNode = ed.state.doc;
  }

  import { locale } from "#lib/locale.svelte.js";
  const count = (n: number, one: string) =>
    `${n.toLocaleString(locale.current ?? "en-US")} ${n === 1 ? one : one + "s"}`;

  // Heading levels offered in the text-style dropdown.
  const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
  type HeadingLevel = (typeof HEADING_LEVELS)[number];

  // Reflects which marks/blocks are active at the cursor, refreshed on every
  // Tiptap transaction so the toolbar buttons stay in sync. Headings are tracked
  // as a single level (0 = normal text) and surfaced through the dropdown.
  let headingLevel = $state(0);
  let active = $state({
    bold: false,
    italic: false,
    strike: false,
    code: false,
    list: false,
    orderedList: false,
    quote: false,
    codeBlock: false,
    link: false,
    table: false,
    tableHeader: false,
    image: false,
  });

  // Tiptap v3 emits the first `onTransaction` synchronously *inside* the
  // `new Editor(...)` call — before the `editor` variable below is assigned — so
  // refreshActive must read the instance the callback hands it, not the
  // (still-undefined) module variable. Falls back to `editor` for the manual
  // call after construction.
  function refreshActive(ed: Editor = editor) {
    headingLevel = HEADING_LEVELS.find((level) => ed.isActive("heading", { level })) ?? 0;
    active = {
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      strike: ed.isActive("strike"),
      code: ed.isActive("code"),
      list: ed.isActive("bulletList"),
      orderedList: ed.isActive("orderedList"),
      quote: ed.isActive("blockquote"),
      codeBlock: ed.isActive("codeBlock"),
      link: ed.isActive("link"),
      table: ed.isActive("table"),
      tableHeader: ed.isActive("tableHeader"),
      image: ed.isActive("image"),
    };
    // What the block under the cursor is currently labelled as, so the toolbar
    // can say so rather than making the author open the dialog to find out.
    const attrs = active.codeBlock ? ed.getAttributes("codeBlock") : {};
    codeMeta = {
      language: typeof attrs.language === "string" ? attrs.language : "",
      title: typeof attrs.title === "string" ? attrs.title : "",
    };
  }

  // Set an explicit heading level from the dropdown, or return to normal text.
  function setHeading(level: HeadingLevel) {
    editor.chain().focus().setHeading({ level }).run();
  }
  function setParagraph() {
    editor.chain().focus().setParagraph().run();
  }

  // Code block language + filename. The control only appears while the cursor is
  // inside a code block, since that is the only time it means anything; it opens
  // with whatever the block already carries, so it edits as well as sets.
  let codeOpen = $state(false);
  let codeLanguage = $state("");
  let codeTitle = $state("");
  let codeMeta = $state({ language: "", title: "" });
  const codeButtonLabel = $derived(codeMeta.language ? codeLanguageLabel(codeMeta.language) : "Language");
  // Matches MAX_TITLE in the backend's Markdown renderer, which caps the same
  // field on a fence — so neither way of writing a post can store a longer one.
  const MAX_CODE_TITLE = 120;
  const selectedLanguageLabel = $derived(CODE_LANGUAGES.find((l) => l.value === codeLanguage)?.label ?? "Auto-detect");

  function openCodeSettings() {
    const attrs = editor.getAttributes("codeBlock");
    codeLanguage = typeof attrs.language === "string" ? attrs.language : "";
    codeTitle = typeof attrs.title === "string" ? attrs.title : "";
    codeOpen = true;
  }

  function applyCodeSettings(e: SubmitEvent) {
    e.preventDefault();
    const title = codeTitle.trim();
    editor
      .chain()
      .focus()
      .updateAttributes("codeBlock", {
        // Null rather than "" for both: an unset attribute is what the reader and
        // the sanitizer expect, and what a Markdown fence produces.
        language: codeLanguage || null,
        title: title || null,
      })
      .run();
    codeOpen = false;
  }

  // Tables. Inserting one is a plain toolbar button; everything else — rows,
  // columns, merging, deleting — only exists while the cursor is in a table, so
  // it lives in a dropdown that appears alongside it, the way the code block's
  // control does.
  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  let tableOpen = $state(false);
  let tableCaption = $state("");
  let tableHeaderRow = $state(false);
  let tableHeaderColumn = $state(false);
  let originalHeaderRow = false;
  let originalHeaderColumn = false;

  function openTableSettings() {
    const from = editor.state.selection.$from;
    let depth = from.depth;
    while (depth > 0 && from.node(depth).type.name !== "table") depth--;
    if (!depth) return;
    const table = from.node(depth);
    tableCaption = table.attrs.caption ?? "";
    originalHeaderRow = tableHeaderRow =
      !!table.firstChild &&
      [...Array(table.firstChild.childCount).keys()].every(
        (i) => table.firstChild!.child(i).type.name === "tableHeader",
      );
    originalHeaderColumn = tableHeaderColumn = [...Array(table.childCount).keys()].every(
      (i) => table.child(i).firstChild?.type.name === "tableHeader",
    );
    tableOpen = true;
  }

  function applyTableSettings(event: SubmitEvent) {
    event.preventDefault();
    const chain = editor
      .chain()
      .focus()
      .updateAttributes("table", { caption: tableCaption.trim() || null });
    if (tableHeaderRow !== originalHeaderRow) chain.toggleHeaderRow();
    if (tableHeaderColumn !== originalHeaderColumn) chain.toggleHeaderColumn();
    chain.run();
    tableOpen = false;
  }

  type TableAction = { label: string; icon: IconName; run: () => void; divider?: boolean; headerOnly?: boolean };
  const tableActions: TableAction[] = [
    { label: "Table accessibility", icon: "table", run: openTableSettings },
    { label: "Row above", icon: "plus", run: () => editor.chain().focus().addRowBefore().run() },
    { label: "Row below", icon: "plus", run: () => editor.chain().focus().addRowAfter().run() },
    {
      label: "Column left",
      icon: "plus",
      divider: true,
      run: () => editor.chain().focus().addColumnBefore().run(),
    },
    {
      label: "Column right",
      icon: "plus",
      run: () => editor.chain().focus().addColumnAfter().run(),
    },
    {
      label: "Toggle header row",
      icon: "table",
      divider: true,
      run: () => editor.chain().focus().toggleHeaderRow().run(),
    },
    { label: "Toggle header column", icon: "table", run: () => editor.chain().focus().toggleHeaderColumn().run() },
    {
      label: "Header applies to column",
      icon: "table",
      headerOnly: true,
      run: () => editor.chain().focus().setCellAttribute("scope", "col").run(),
    },
    {
      label: "Header applies to row",
      icon: "table",
      headerOnly: true,
      run: () => editor.chain().focus().setCellAttribute("scope", "row").run(),
    },
    // Only does anything across a multi-cell selection; Tiptap no-ops otherwise
    // rather than erroring, so it needs no guard of its own.
    { label: "Merge cells", icon: "table", run: () => editor.chain().focus().mergeCells().run() },
    { label: "Split cell", icon: "table", run: () => editor.chain().focus().splitCell().run() },
    {
      label: "Delete row",
      icon: "trash",
      divider: true,
      run: () => editor.chain().focus().deleteRow().run(),
    },
    { label: "Delete column", icon: "trash", run: () => editor.chain().focus().deleteColumn().run() },
    { label: "Delete table", icon: "trash", run: () => editor.chain().focus().deleteTable().run() },
  ];

  // Link insertion uses a Bits UI dialog (not window.prompt). Toggling an active
  // link removes it; otherwise the dialog collects a URL for the selection.
  let linkOpen = $state(false);
  let linkUrl = $state("");

  function toggleLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    linkUrl = "";
    linkOpen = true;
  }

  function applyLink(e: SubmitEvent) {
    e.preventDefault();
    const url = linkUrl.trim();
    if (url) editor.chain().focus().setLink({ href: url }).run();
    linkOpen = false;
  }

  // Alt text for an image, collected the same way a link URL is. The node view
  // is plain DOM (see resizable-image.ts) and cannot open a Svelte component,
  // so its "Alt" button raises an event carrying the image's position and the
  // description it already has; this owns the dialog and writes the answer back.
  let altOpen = $state(false);
  let altText = $state("");
  let altPos: number | null = null;
  let imageWidth = $state<number | undefined>(100);
  let initialImageWidth = 100;
  let imageSettingsError = $state("");

  function openAltDialog(event: Event) {
    const { pos, alt } = (event as CustomEvent<EditAltDetail>).detail;
    altPos = pos;
    altText = alt;
    const width = editor.state.doc.nodeAt(pos)?.attrs.width;
    imageWidth = typeof width === "string" && width.endsWith("%") ? Number.parseFloat(width) : 100;
    initialImageWidth = imageWidth;
    imageSettingsError = "";
    altOpen = true;
  }

  function applyAlt(e: SubmitEvent) {
    e.preventDefault();
    if (imageWidth === undefined || !Number.isInteger(imageWidth) || imageWidth < 10 || imageWidth > 100) {
      imageSettingsError = "Choose a whole-number width from 10 to 100 percent.";
      return;
    }
    altOpen = false;
    if (altPos === null) return;
    const node = editor.state.doc.nodeAt(altPos);
    // The document can move under an open dialog — an undo, or a collaborator's
    // edit in some future version. Writing to a position that is no longer this
    // image would relabel the wrong one, so confirm before committing.
    if (node?.type.name === "image") {
      editor.view.dispatch(
        editor.view.state.tr.setNodeMarkup(altPos, undefined, {
          ...node.attrs,
          // Saving an empty alternative explicitly marks this image decorative.
          alt: altText.trim(),
          width: imageWidth === initialImageWidth ? node.attrs.width : `${imageWidth}%`,
        }),
      );
    }
    altPos = null;
    editor.commands.focus();
  }

  function openSelectedImage() {
    const pos = editor.state.selection.from;
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name !== "image") return;
    openAltDialog(new CustomEvent(EDIT_ALT_EVENT, { detail: { pos, alt: node.attrs.alt ?? "" } }));
  }

  function reviewIssue(issue: AccessibilityIssue) {
    if (issue.kind === "image") {
      editor.commands.setNodeSelection(issue.pos);
      openSelectedImage();
    } else {
      editor
        .chain()
        .focus()
        .setTextSelection(issue.pos + (issue.kind === "table" ? 3 : 1))
        .run();
      if (issue.kind === "table") openTableSettings();
    }
  }

  function editAlternative(match: TextMatch) {
    focusElement(editor, match.pos);
    if (match.alternative === "image") openSelectedImage();
    else openTableSettings();
  }

  // Emoji picker: inserts the picked Unicode emoji at the cursor. Emoji are
  // stored as plain Unicode (not images) and rendered as Twemoji by the
  // unicode-range font, so federated/exported content stays text.
  function insertEmoji(emoji: string) {
    editor.chain().focus().insertContent(emoji).run();
  }

  // Image upload: the picked file is resized/compressed in the browser (see
  // image.ts), uploaded, then inserted at the cursor as an image node.
  let imageInput = $state<HTMLInputElement | null>(null);
  let uploadsInFlight = $state(0);
  const uploading = $derived(uploadsInFlight > 0);
  let uploadError = $state("");

  // Picker uploads use the cursor; content transfers keep their own mapped target.
  async function uploadImages(files: File[]) {
    const images = files.filter(isAcceptedImage);
    if (!images.length) {
      uploadError = "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
      return;
    }
    uploadError = "";
    uploadsInFlight++;
    // Insertion walks forward as images land, so picking several files keeps
    // their original order instead of stacking them in reverse.
    try {
      for (const file of images) {
        const { blob, type } = await prepareImage(file);
        const { url } = await endpoints().uploadImage(blob, type);
        // Insert the image together with a trailing paragraph so the author can
        // keep writing immediately — just like a normal editor.
        const nodes = [{ type: "image", attrs: { src: url } }, { type: "paragraph" }];
        editor.chain().focus().insertContent(nodes).scrollIntoView().run();
      }
    } catch (err) {
      uploadError = err instanceof ApiError ? err.message : "Failed to upload image.";
    } finally {
      uploadsInFlight--;
    }
  }

  function onImagePick(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ""; // allow re-picking the same file later
    if (files.length) void uploadImages(files);
  }

  type InsertionTarget = { kind: "paste"; bookmark: SelectionBookmark } | { kind: "drop"; pos: number };
  type ContentInsertion = InsertionTarget & {
    slice: Slice;
    files: File[];
    losses: string[];
    referenceProblems: string[];
  };
  let transferReview = $state.raw<ContentInsertion | null>(null);
  let reviewKind = $state<"paste" | "drop">("paste");
  const contentInsertions = new Set<ContentInsertion>();

  function cancelTransfer() {
    if (transferReview) contentInsertions.delete(transferReview);
    transferReview = null;
  }

  function planTransfer(insertion: ContentInsertion, transferred = insertion.slice) {
    const transaction = editor.state.tr;
    if (insertion.kind === "paste") transaction.setSelection(insertion.bookmark.resolve(editor.state.doc));
    const destination =
      insertion.kind === "paste"
        ? editor.state.tr.setSelection(transaction.selection).deleteSelection().doc
        : transaction.doc;
    const slice = remapTransferIds(transferred, destination);
    if (insertion.kind === "paste") transaction.replaceSelection(slice).setMeta("paste", true);
    else {
      transaction.replaceRange(insertion.pos, insertion.pos, slice);
      transaction.setSelection(Selection.near(transaction.doc.resolve(transaction.mapping.map(insertion.pos))));
    }
    return { transaction, slice, problems: transferReferenceProblems(editor.state.doc, transaction.doc, slice) };
  }

  function reviewTransfer(insertion: ContentInsertion) {
    reviewKind = insertion.kind;
    transferReview = insertion;
  }

  async function insertTransfer(insertion: ContentInsertion) {
    if (editor.isDestroyed || !contentInsertions.has(insertion)) return;
    let uploadStarted = false;
    try {
      uploadError = "";
      insertion.referenceProblems = planTransfer(insertion).problems;
      if (insertion.referenceProblems.length) {
        reviewTransfer(insertion);
        return;
      }
      if (insertion.kind === "drop") {
        editor.view.dispatch(editor.state.tr.setSelection(Selection.near(editor.state.doc.resolve(insertion.pos))));
        editor.view.focus();
      }
      if (insertion.files.length) {
        uploadsInFlight++;
        uploadStarted = true;
      }
      const sources: string[] = [];
      for (const file of insertion.files) {
        const { blob, type } = await prepareImage(file);
        if (!contentInsertions.has(insertion)) return;
        const { url } = await endpoints().uploadImage(blob, type);
        sources.push(url);
      }
      if (editor.isDestroyed || !contentInsertions.has(insertion)) return;
      const slice = sources.length ? rehostTransferImages(insertion.slice, sources) : insertion.slice;
      const { transaction, problems } = planTransfer(insertion, slice);
      if (problems.length) {
        insertion.referenceProblems = problems;
        reviewTransfer(insertion);
        return;
      }
      editor.view.dispatch(closeHistory(transaction).scrollIntoView().setMeta("uiEvent", insertion.kind));
      // Do not group the transfer with a subsequent native paste or typed edit either.
      editor.view.dispatch(closeHistory(editor.state.tr));
      editor.view.focus();
    } catch (error) {
      uploadError =
        error instanceof ApiError ? error.message : "Could not insert the content. Try again or paste plain text.";
    } finally {
      if (transferReview !== insertion) contentInsertions.delete(insertion);
      if (uploadStarted) uploadsInFlight--;
    }
  }

  function acceptTransfer() {
    const insertion = transferReview;
    transferReview = null;
    if (insertion) void insertTransfer(insertion);
  }

  function receiveTransfer(
    view: Editor["view"],
    event: Event,
    data: DataTransfer | null,
    slice: Slice,
    target: InsertionTarget,
  ): boolean {
    if (!editor.isEditable || transferReview) return true;
    const files = Array.from(data?.files ?? []);
    const html = data?.getData("text/html") ?? "";
    if (files.some((file) => !isAcceptedImage(file))) {
      uploadError = "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
      return true;
    }
    const context = target.kind === "paste" ? view.state.selection.$from : view.state.doc.resolve(target.pos);
    if (!files.length && context.parent.type.spec.code) return false;
    const origin = target.kind === "paste" ? "Clipboard" : "Dropped";
    const action = target.kind === "paste" ? "Paste" : "Drop";
    if (html && files.length && (files.length !== 1 || transferImageCount(slice) !== 1)) {
      uploadError = `${origin} images could not be matched to their descriptions. ${action} one image at a time, or upload the files and add descriptions with Image settings.`;
      return true;
    }
    if (!html && files.length && (data?.getData("text/plain") || data?.getData("Text"))?.trim()) {
      uploadError =
        "Text could not be reliably associated with these files. Insert the text separately, then upload the images and add descriptions with Image settings.";
      return true;
    }
    const losses = html ? transferLoss(html, slice, view.state.schema) : [];
    const preserved =
      !html && files.length ? fileTransferSlice(view.state.schema, files.length) : preserveTransferBoundaries(slice);
    const insertion: ContentInsertion = { ...target, slice: preserved, files, losses, referenceProblems: [] };
    if (insertion.kind === "drop") insertion.pos = dropPoint(view.state.doc, insertion.pos, preserved) ?? insertion.pos;
    let planned: ReturnType<typeof planTransfer>;
    try {
      planned = planTransfer(insertion);
    } catch {
      uploadError = "Could not insert the content. Try again or paste plain text.";
      return true;
    }
    insertion.referenceProblems = planned.problems;
    if (!losses.length && !files.length && !planned.problems.length && planned.slice === slice) return false;
    event.preventDefault();
    contentInsertions.add(insertion);
    if (losses.length || insertion.referenceProblems.length) reviewTransfer(insertion);
    else void insertTransfer(insertion);
    return true;
  }

  function handlePaste(view: Editor["view"], event: ClipboardEvent, slice: Slice): boolean {
    return receiveTransfer(view, event, event.clipboardData, slice, {
      kind: "paste",
      bookmark: view.state.selection.getBookmark(),
    });
  }

  function handleDrop(view: Editor["view"], event: DragEvent, slice: Slice, moved: boolean): boolean {
    if (!editor.isEditable || transferReview) return true;
    if (moved || view.dragging) return false;
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
    if (pos === undefined) {
      uploadError = "Could not find a drop position. Try again, or paste the content at the text cursor.";
      return true;
    }
    return receiveTransfer(view, event, event.dataTransfer, slice, { kind: "drop", pos });
  }

  // A post's body is stored as HTML, and only posts written here also have the
  // ProseMirror JSON. Everything ingested through the content webhook has
  // `contentJson` null (services/webhooks.ts sets it so explicitly), so opening
  // one for editing hands Tiptap a string — and tiptap-markdown replaces the
  // initial-content parse with its own, running that string through markdown-it.
  // Configured with `html: false`, as it must be for pasted Markdown we do not
  // trust, markdown-it escapes the tags: the author was shown `<p>alpha</p>` as
  // literal text, and saving stored that escaped text as the post.
  //
  // Parsing it as the HTML it actually is fixes both halves. Typed and pasted
  // Markdown is untouched — that goes through input rules and the clipboard
  // handler, not through here.
  onMount(() => {
    const initialContent = typeof content === "string" ? (generateJSON(content, extensions) as Content) : content;
    editor = new Editor({
      injectNonce: document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce,
      element: element!,
      // Placeholder is per-instance (it needs the `placeholder` prop), so it's
      // appended to the shared base extensions here. The first line shows the
      // article prompt; every other empty line (e.g. below an image) shows a
      // generic hint, so there's always a visible caret target.
      extensions: [
        ...extensions,
        Placeholder.configure({
          placeholder: ({ pos }) => (pos === 0 ? placeholder : "Write something…"),
        }),
      ],
      content: initialContent,
      editorProps: {
        attributes: () => ({
          class: "tiptap prose-omicron",
          "aria-label": "Article body",
          "aria-multiline": "true",
          "aria-readonly": String(editor?.isEditable === false),
          "aria-describedby": keyboardHelpId,
          "aria-keyshortcuts": "Alt+F10 Control+k Meta+k",
        }),
        handleKeyDown: editorKeydown,
        handleDOMEvents: {
          paste(view) {
            if (!view.editable || view.composing || !view.hasFocus() || transferReview) return false;
            // Let the native selection observer catch up before clipboard parsing captures its context.
            view.dom.ownerDocument.dispatchEvent(new Event("selectionchange"));
            return false;
          },
        },
        handlePaste,
        handleDrop,
      },
      onUpdate: ({ editor: ed }) => {
        if (importBlocked) return;
        onUpdate(ed.getHTML(), ed.getJSON());
        refreshStats(ed);
      },
      onTransaction: ({ editor: ed, transaction }) => {
        for (const insertion of contentInsertions) {
          if (insertion.kind === "paste") insertion.bookmark = insertion.bookmark.map(transaction.mapping);
          else insertion.pos = transaction.mapping.map(insertion.pos);
        }
        refreshActive(ed);
      },
    });
    const originalHtml = typeof content === "string" ? content : previewHtml;
    if (originalHtml) {
      importLosses = contentLoss(originalHtml, editor.getHTML());
      if (importLosses.length) editor.setEditable(false, false);
    }
    refreshActive();
    // A reopened draft arrives with its body already in place, so the counter
    // has to start from that rather than from zero.
    refreshStats(editor);
    // The alt-text button lives inside a node view, so its event surfaces on
    // the editor's own DOM rather than anywhere Svelte can bind to directly.
    editor.view.dom.addEventListener(EDIT_ALT_EVENT, openAltDialog);
    mounted = true;
  });

  onDestroy(() => {
    contentInsertions.clear();
    editor?.view.dom.removeEventListener(EDIT_ALT_EVENT, openAltDialog);
    editor?.destroy();
  });

  // `key` (when present) is the active-state flag that highlights the button;
  // `divider` inserts a separator before the button. One-shot actions like the
  // horizontal rule have no key.
  type Tool = {
    key?: keyof typeof active;
    icon: IconName;
    label: string;
    run: () => void;
    divider?: boolean;
  };
  const tools: Tool[] = [
    { key: "bold", icon: "bold", label: "Bold", run: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", icon: "italic", label: "Italic", run: () => editor.chain().focus().toggleItalic().run() },
    { key: "strike", icon: "strike", label: "Strikethrough", run: () => editor.chain().focus().toggleStrike().run() },
    { key: "code", icon: "code", label: "Inline code", run: () => editor.chain().focus().toggleCode().run() },
    { key: "link", icon: "link", label: "Link", run: toggleLink },
    {
      key: "list",
      icon: "list",
      label: "Bullet list",
      divider: true,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      key: "orderedList",
      icon: "orderedList",
      label: "Numbered list",
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    { key: "quote", icon: "quote", label: "Quote", run: () => editor.chain().focus().toggleBlockquote().run() },
    {
      key: "codeBlock",
      icon: "codeBlock",
      label: "Code block",
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    { icon: "table", label: "Table", divider: true, run: insertTable },
    { icon: "image", label: "Image", run: () => imageInput?.click() },
    { icon: "hr", label: "Divider", run: () => editor.chain().focus().setHorizontalRule().run() },
  ];

  const btn =
    "rounded-9px bg-background-alt hover:bg-muted active:bg-dark-10 inline-flex size-10 shrink-0 items-center justify-center transition-all active:scale-[0.98]";
  // Auto-width variant for the text-style dropdown trigger (icon + chevron).
  const headingTrigger =
    "rounded-9px bg-background-alt hover:bg-muted active:bg-dark-10 inline-flex h-10 shrink-0 items-center gap-1 px-2.5 transition-all active:scale-[0.98]";
  // Verbatim Bits UI docs DropdownMenu.Item class (v3 syntax), matching the post menu.
  const itemClass =
    "rounded-button data-highlighted:bg-muted ring-0! ring-transparent! flex h-9 w-full cursor-pointer select-none items-center gap-2.5 px-2.5 text-sm font-medium focus-visible:outline-hidden";
</script>

{#if importBlocked}
  <div role="alert" class="mb-4 rounded-card border border-border bg-background-alt p-4 text-sm">
    <p class="font-semibold text-foreground">Rich editing may simplify imported content.</p>
    <p class="mt-2 text-muted-foreground">
      Some structure or accessibility information cannot be represented by this editor. The original body stays
      unchanged unless you explicitly continue and edit it. Keep an export before continuing if you need the original
      markup.
    </p>
    <p class="mt-2 break-words text-muted-foreground">
      Affected information: {importLosses.slice(0, 8).join(", ")}{importLosses.length > 8 ? ", …" : ""}.
    </p>
    <Button
      variant="outline"
      size="sm"
      class="mt-3"
      onclick={() => {
        importAcknowledged = true;
        editor.setEditable(true, false);
      }}>Edit simplified content</Button
    >
  </div>
{/if}

<fieldset disabled={importBlocked} class="min-w-0">
  <legend class="sr-only">Article editor</legend>
  <Toolbar.Root
    bind:ref={toolbar}
    aria-label="Article formatting"
    aria-describedby={keyboardHelpId}
    aria-keyshortcuts="Escape Alt+F10"
    onkeydown={toolbarKeydown}
    class="no-scrollbar mb-4 flex w-full items-center justify-start gap-0.5 overflow-x-auto rounded-10px border border-border bg-background-alt px-2 py-1 shadow-mini sm:justify-between sm:gap-0"
  >
    <!-- Text style: a single dropdown for normal text + Heading 1–6. -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={`${headingTrigger} ${headingLevel ? "text-foreground/80" : "text-foreground/60"}`}
        aria-label="Text style"
        title="Text style"
      >
        {#snippet child({ props })}
          <Toolbar.Button {...props}>
            <Icon name={headingLevel ? (`h${headingLevel}` as IconName) : "heading"} size={18} />
            <Icon name="chevronDown" size={14} />
          </Toolbar.Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="start"
          class="z-30 w-[200px] rounded-xl border border-muted bg-background px-1 py-1.5 shadow-popover focus-visible:outline-hidden"
        >
          <DropdownMenu.Item onSelect={setParagraph} class={`${itemClass} ${headingLevel === 0 ? "bg-muted" : ""}`}>
            <Icon name="paragraph" size={16} /> Normal text
          </DropdownMenu.Item>
          {#each HEADING_LEVELS as level (level)}
            <DropdownMenu.Item
              onSelect={() => setHeading(level)}
              class={`${itemClass} ${headingLevel === level ? "bg-muted" : ""}`}
            >
              <Icon name={`h${level}` as IconName} size={16} /> Heading {level}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>

    {#each tools as tool (tool.label)}
      <Toolbar.Button
        onclick={tool.run}
        aria-label={tool.label}
        title={tool.label}
        aria-pressed={tool.key ? active[tool.key] : undefined}
        class={`${btn} ${tool.key && active[tool.key] ? "bg-muted text-foreground/80" : "text-foreground/60"}`}
      >
        <Icon name={tool.icon} size={18} />
      </Toolbar.Button>
    {/each}

    <!-- Only while the cursor is in a code block: naming a language or a file
         is meaningless anywhere else, and a permanently disabled button would
         say less than an absent one. -->
    {#if active.codeBlock}
      <Toolbar.Button
        onclick={openCodeSettings}
        aria-label="Code block language and filename"
        title="Language and filename"
        class={`${headingTrigger} max-w-44 text-sm text-foreground/60`}
      >
        <Icon name="settings" size={16} class="shrink-0" />
        <span class="truncate">{codeButtonLabel}</span>
      </Toolbar.Button>
    {/if}

    <!-- Row/column editing, for as long as the cursor is in a table. Same rule
         as the code block control: shown where it applies, absent elsewhere. -->
    {#if active.table}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class={`${headingTrigger} text-sm text-foreground/60`}
          aria-label="Edit table"
          title="Edit table"
        >
          {#snippet child({ props })}
            <Toolbar.Button {...props}>
              <Icon name="table" size={16} class="shrink-0" />
              <span>Table</span>
              <Icon name="chevronDown" size={14} />
            </Toolbar.Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={8}
            align="start"
            class="z-30 w-[200px] rounded-xl border border-muted bg-background px-1 py-1.5 shadow-popover focus-visible:outline-hidden"
          >
            {#each tableActions as action (action.label)}
              {#if action.divider}
                <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
              {/if}
              <DropdownMenu.Item
                onSelect={action.run}
                disabled={action.headerOnly && !active.tableHeader}
                class={itemClass}
              >
                <Icon name={action.icon} size={16} />
                {action.label}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}

    {#if active.image}
      <Toolbar.Button onclick={openSelectedImage} aria-label="Image settings" title="Image settings" class={btn}>
        <Icon name="settings" size={18} />
      </Toolbar.Button>
    {/if}

    <!-- Emoji picker. The web component is lazy-loaded on first open (see
         EmojiPicker.svelte), so it stays out of the editor's initial work. -->
    {#if mounted}<PassageLanguage {editor} />{/if}
    <EmojiTrigger inToolbar onPick={insertEmoji} class={`${btn} text-foreground/60`} />
  </Toolbar.Root>

  <p id={keyboardHelpId} class="mb-4 text-sm text-muted-foreground">
    Keyboard: Alt+F10 moves from the body to the formatting toolbar. Use arrow keys to choose a tool; Escape or Alt+F10
    returns to the body. Close an open menu or dialog with Escape first.
  </p>

  <input
    bind:this={imageInput}
    type="file"
    hidden
    aria-label="Upload article images"
    accept="image/png,image/jpeg,image/webp,image/gif"
    class="hidden"
    onchange={onImagePick}
  />

  {#if uploading}
    <p role="status" class="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="spinner" size={15} class="animate-spin" /> Uploading image…
    </p>
  {/if}
  {#if uploadError}
    <p role="alert" class="mb-3 text-sm text-destructive">{uploadError}</p>
  {/if}

  <!-- The body as the server can render it, in the editor's own classes and
       ProseMirror's base styles, so nothing moves when Tiptap replaces it. -->
  {#if !mounted}
    <div
      class="tiptap prose-omicron relative break-words whitespace-break-spaces [font-variant-ligatures:none]"
      aria-hidden="true"
    >
      {#if preview}
        {@html preview}
      {:else}
        <p class="is-empty is-editor-empty" data-placeholder={placeholder}><br class="ProseMirror-trailingBreak" /></p>
      {/if}
    </div>
  {/if}
  <div bind:this={element}></div>

  <!-- Bottom right, out of the way: read when wanted, ignored otherwise. -->
  <p class="mt-2 flex justify-end gap-2 text-xs text-muted-foreground tabular-nums">
    <span>{count(stats.characters, "character")}</span>
    <span aria-hidden="true">·</span>
    <span>{count(stats.words, "word")}</span>
    <!-- Always shown, so the line doesn't grow once the editor counts a draft. -->
    <span aria-hidden="true">·</span>
    <span>{stats.minutes} min read</span>
  </p>

  {#if mounted && documentNode}
    <EditorNavigation {editor} doc={documentNode} onAlternative={editAlternative} />
  {/if}
  <Collapsible.Root bind:open={checksOpen} class="mt-4 rounded-card border border-border bg-background-alt p-4">
    <Collapsible.Trigger
      class="inline-flex h-10 items-center gap-2 rounded-input px-3 text-sm font-medium text-foreground hover:bg-muted"
    >
      <Icon name="check" size={16} /> Check accessibility ({issues.length})
    </Collapsible.Trigger>
    <Collapsible.Content class="mt-3 space-y-3 text-sm">
      <p role="status">
        {issues.length
          ? `${issues.length} items to review.`
          : "No issues found by these checks. Manual review is still needed."}
      </p>
      <p class="text-muted-foreground">
        Describe informative images; save an empty alternative only for decorative images. Use descriptive links,
        ordered headings, and table headers. These checks cannot judge descriptions, reading order, or every WCAG
        requirement.
      </p>
      <ul class="space-y-3">
        {#each issues as issue (`${issue.code}-${issue.pos}`)}
          <li class="flex flex-wrap items-center justify-between gap-2">
            <span class="min-w-0 flex-1 text-muted-foreground">{issue.message}</span>
            <Button variant="outline" size="sm" onclick={() => reviewIssue(issue)}>Review {issue.label}</Button>
          </li>
        {/each}
      </ul>
      <p class="text-muted-foreground">
        Keyboard: Tab moves between controls; arrow keys navigate the formatting toolbar. Use Image settings for
        resizing without dragging. Standard undo and redo shortcuts work in the body.
      </p>
      <p class="text-muted-foreground">
        In the body, use Ctrl (Command on macOS) with B for bold, I for italic, U for underline, or K to add or remove a
        link. Ctrl+Alt+1 through Ctrl+Alt+6 (Command+Option+1 through Command+Option+6 on macOS) toggle heading levels.
      </p>
    </Collapsible.Content>
  </Collapsible.Root>
  <AccessibilityGuidance />
</fieldset>

<Dialog.Root
  open={transferReview !== null}
  onOpenChange={(open) => {
    if (!open) cancelTransfer();
  }}
>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (editor && !editor.isDestroyed) editor.view.focus();
      }}
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[480px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground"
        >Review {reviewKind === "drop" ? "dropped" : "pasted"} content</Dialog.Title
      >
      <Dialog.Description class="mt-2 text-sm text-muted-foreground"
        >{#if transferReview?.referenceProblems.length}
          Some references have missing or ambiguous targets. The content has not been inserted. Cancel and include the
          referenced descriptions or headers, resolve duplicate IDs, or paste as plain text.
        {:else}Rich editing will simplify this content and may remove structure or accessibility information. Cancel to
          keep the article unchanged, or {reviewKind === "drop" ? "insert" : "paste"} the simplified content and review its
          descriptions, languages, and relationships.{/if}</Dialog.Description
      >
      <p class="mt-3 text-sm break-words text-muted-foreground">
        Affected information: {[...(transferReview?.referenceProblems ?? []), ...(transferReview?.losses ?? [])]
          .slice(0, 8)
          .join(", ")}.
      </p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <Dialog.Close
          class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >Cancel</Dialog.Close
        >
        {#if !transferReview?.referenceProblems.length}
          <Button variant="solid" onclick={acceptTransfer}
            >{reviewKind === "drop" ? "Insert" : "Paste"} simplified content</Button
          >
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={codeOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Code block</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        The language colours the code. The filename shows above it, with the language's mark.
      </Dialog.Description>
      <form onsubmit={applyCodeSettings} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="code-language" class="text-sm leading-none font-medium">Language</Label.Root>
          <Select.Root type="single" bind:value={codeLanguage}>
            <Select.Trigger
              id="code-language"
              class="inline-flex h-10 w-full items-center justify-between gap-2 rounded-input border border-border-input bg-background px-3 text-sm shadow-btn outline-hidden transition-colors focus:border-foreground"
            >
              <span class="truncate">{selectedLanguageLabel}</span>
              <Icon name="chevronDown" size={15} class="shrink-0 text-muted-foreground" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                class="z-50 max-h-72 w-(--bits-select-anchor-width) overflow-y-auto rounded-card border border-muted bg-background p-1 shadow-popover"
                sideOffset={6}
              >
                <Select.Viewport>
                  <Select.Item
                    value=""
                    label="Auto-detect"
                    class="flex h-9 w-full items-center gap-2 rounded-button px-2 text-sm outline-hidden select-none data-highlighted:bg-muted"
                  >
                    {#snippet children({ selected: isSel })}
                      <span class="truncate text-muted-foreground">Auto-detect</span>
                      {#if isSel}
                        <Icon name="check" size={15} class="ml-auto shrink-0 text-foreground" />
                      {/if}
                    {/snippet}
                  </Select.Item>
                  {#each CODE_LANGUAGES as lang (lang.value)}
                    <Select.Item
                      value={lang.value}
                      label={lang.label}
                      class="flex h-9 w-full items-center gap-2 rounded-button px-2 text-sm outline-hidden select-none data-highlighted:bg-muted"
                    >
                      {#snippet children({ selected: isSel })}
                        <span class="truncate">{lang.label}</span>
                        {#if isSel}
                          <Icon name="check" size={15} class="ml-auto shrink-0 text-foreground" />
                        {/if}
                      {/snippet}
                    </Select.Item>
                  {/each}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="code-title" class="text-sm leading-none font-medium">
            Filename <span class="font-normal text-muted-foreground">(optional)</span>
          </Label.Root>
          <input
            id="code-title"
            bind:value={codeTitle}
            type="text"
            maxlength={MAX_CODE_TITLE}
            placeholder="src/main.ts"
            class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <button
            type="submit"
            class="inline-flex h-10 items-center justify-center rounded-input bg-dark px-5 text-sm font-semibold text-background shadow-mini hover:bg-dark/95 active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={altOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Describe this image</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        Read aloud to people using a screen reader, and shown if the image fails to load. Leave it empty if the image is
        purely decorative. You can also resize the image without dragging.
      </Dialog.Description>
      <form onsubmit={applyAlt} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="image-alt" class="text-sm leading-none font-medium">Alt text</Label.Root>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="image-alt"
            bind:value={altText}
            type="text"
            placeholder="A rabbit peering out of its burrow"
            autofocus
            class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="image-width" class="text-sm leading-none font-medium">Image width (%)</Label.Root>
          <input
            id="image-width"
            type="number"
            min="10"
            max="100"
            step="1"
            required
            bind:value={imageWidth}
            aria-invalid={!!imageSettingsError}
            aria-describedby="image-width-hint"
            class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden focus:border-foreground"
          />
          <p id="image-width-hint" class="text-xs text-muted-foreground">
            10–100 percent of the article width. The aspect ratio stays unchanged.
          </p>
        </div>
        {#if imageSettingsError}<p role="alert" class="text-sm text-destructive">{imageSettingsError}</p>{/if}
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <button
            type="submit"
            class="inline-flex h-10 items-center justify-center rounded-input bg-dark px-5 text-sm font-semibold text-background shadow-mini hover:bg-dark/95 active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={tableOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Table accessibility</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground"
        >Describe the table and identify its data headers. Review complex relationships manually.</Dialog.Description
      >
      <form onsubmit={applyTableSettings} class="mt-4 flex flex-col gap-4">
        <Label.Root for="table-caption" class="text-sm leading-none font-medium">Table caption</Label.Root>
        <input
          id="table-caption"
          bind:value={tableCaption}
          class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden focus:border-foreground"
        />
        {#each ["row", "column"] as axis (axis)}
          <div class="flex items-center space-x-3">
            <Checkbox.Root
              id={`table-header-${axis}`}
              checked={axis === "row" ? tableHeaderRow : tableHeaderColumn}
              onCheckedChange={(checked) => {
                if (axis === "row") tableHeaderRow = checked;
                else tableHeaderColumn = checked;
              }}
              class="peer inline-flex size-[25px] items-center justify-center rounded-md border border-muted bg-foreground transition-all duration-150 ease-in-out active:scale-[0.98] data-[state=unchecked]:border-border-input data-[state=unchecked]:bg-background data-[state=unchecked]:hover:border-dark-40"
            >
              {#snippet children({ checked })}{#if checked}<Icon
                    name="check"
                    size={15}
                    class="text-background"
                  />{/if}{/snippet}
            </Checkbox.Root>
            <Label.Root
              for={`table-header-${axis}`}
              class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >Header {axis}</Label.Root
            >
          </div>
        {/each}
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
            >Cancel</Dialog.Close
          >
          <Button type="submit" variant="solid">Save</Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={linkOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Add link</Dialog.Title>
      <form onsubmit={applyLink} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="link-url" class="text-sm leading-none font-medium">URL</Label.Root>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="link-url"
            bind:value={linkUrl}
            type="url"
            placeholder="https://example.com"
            autofocus
            class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <button
            type="submit"
            class="inline-flex h-10 items-center justify-center rounded-input bg-dark px-5 text-sm font-semibold text-background shadow-mini hover:bg-dark/95 active:scale-[0.98]"
          >
            Add link
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
