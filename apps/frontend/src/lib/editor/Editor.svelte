<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { type Content, Editor } from "@tiptap/core";
  import Placeholder from "@tiptap/extension-placeholder";
  import { Dialog, DropdownMenu, Label, Select, Toolbar } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import EmojiTrigger from "$lib/components/EmojiTrigger.svelte";
  import { endpoints, ApiError } from "$lib/api";
  import { isAcceptedImage, prepareImage } from "./image";
  import { EDIT_ALT_EVENT, type EditAltDetail } from "./resizable-image";
  import { extensions } from "./extensions";
  import { CODE_LANGUAGES, codeLanguageLabel } from "$lib/codeLanguages";
  import { countWords, readTimeFromWords } from "$lib/format";

  // Isolated Tiptap integration. The parent receives content via `onUpdate`.
  // This component is lazy-loaded (dynamic import) so Tiptap stays out of the
  // initial bundle — see /compose.
  //
  // `content` should be Tiptap's native JSON (ProseMirror doc) when rehydrating
  // an existing post — a plain string is parsed as Markdown by the markdown
  // extension, so passing stored HTML as a string would show the tags verbatim.
  let {
    onUpdate,
    placeholder = "Write your article…",
    content,
  }: {
    onUpdate: (html: string, json: unknown) => void;
    placeholder?: string;
    content?: Content;
  } = $props();

  let element: HTMLDivElement;
  let editor: Editor;

  // The status line every desktop editor has: how much is there, and how long
  // it will take to read. Recomputed from the document itself rather than from
  // the serialized HTML, so markup never inflates the count.
  //
  // Only on a document change, never on a bare cursor move — `onTransaction`
  // fires for every arrow key, and walking the whole document that often buys
  // nothing that changes on screen.
  let stats = $state({ characters: 0, words: 0, minutes: 0 });

  function refreshStats(ed: Editor) {
    // One newline per block, so paragraphs are counted as separated rather than
    // running the last word of one into the first of the next.
    const text = ed.getText({ blockSeparator: "\n" });
    const words = countWords(text);
    stats = { characters: text.length, words, minutes: readTimeFromWords(words) };
  }

  const LOCALE = "en-US";
  const count = (n: number, one: string) =>
    `${n.toLocaleString(LOCALE)} ${n === 1 ? one : one + "s"}`;

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
  const codeButtonLabel = $derived(
    codeMeta.language ? codeLanguageLabel(codeMeta.language) : "Language",
  );
  // Matches MAX_TITLE in the backend's Markdown renderer, which caps the same
  // field on a fence — so neither way of writing a post can store a longer one.
  const MAX_CODE_TITLE = 120;
  const selectedLanguageLabel = $derived(
    CODE_LANGUAGES.find((l) => l.value === codeLanguage)?.label ?? "Auto-detect",
  );

  function openCodeSettings() {
    const attrs = editor.getAttributes("codeBlock");
    codeLanguage = typeof attrs.language === "string" ? attrs.language : "";
    codeTitle = typeof attrs.title === "string" ? attrs.title : "";
    codeOpen = true;
  }

  function applyCodeSettings(e: SubmitEvent) {
    e.preventDefault();
    const title = codeTitle.trim();
    editor.chain().focus().updateAttributes("codeBlock", {
      // Null rather than "" for both: an unset attribute is what the reader and
      // the sanitizer expect, and what a Markdown fence produces.
      language: codeLanguage || null,
      title: title || null,
    }).run();
    codeOpen = false;
  }

  // Tables. Inserting one is a plain toolbar button; everything else — rows,
  // columns, merging, deleting — only exists while the cursor is in a table, so
  // it lives in a dropdown that appears alongside it, the way the code block's
  // control does.
  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  type TableAction = { label: string; icon: IconName; run: () => void; divider?: boolean };
  const tableActions: TableAction[] = [
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

  function openAltDialog(event: Event) {
    const { pos, alt } = (event as CustomEvent<EditAltDetail>).detail;
    altPos = pos;
    altText = alt;
    altOpen = true;
  }

  function applyAlt(e: SubmitEvent) {
    e.preventDefault();
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
          // An empty description is stored as null rather than "", which is how
          // the node view tells "not described yet" from "deliberately
          // decorative" — and `alt=""` is the correct markup for the latter.
          alt: altText.trim() || null,
        }),
      );
    }
    altPos = null;
    editor.commands.focus();
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
  let uploading = $state(false);
  let uploadError = $state("");

  // Uploads images and inserts them at `pos` (defaults to the current cursor).
  // Shared by the toolbar picker, clipboard paste, and drag-and-drop.
  async function uploadImages(files: File[], pos?: number) {
    const images = files.filter(isAcceptedImage);
    if (!images.length) {
      uploadError = "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
      return;
    }
    uploadError = "";
    uploading = true;
    // Insertion walks forward as images land, so pasting several files keeps
    // their original order instead of stacking them in reverse.
    let at = pos;
    try {
      for (const file of images) {
        const { blob, type } = await prepareImage(file);
        const { url } = await endpoints().uploadImage(blob, type);
        // Insert the image together with a trailing paragraph so the author can
        // keep writing immediately — just like a normal editor.
        const content = [
          { type: "image", attrs: { src: url } },
          { type: "paragraph" },
        ];
        const chain = editor.chain();
        if (at === undefined) chain.insertContent(content).focus("end");
        else {
          // The image node is 1 wide and the empty paragraph 2, so the caret
          // lands at `at + 2` and the next image goes after both.
          chain.insertContentAt(at, content).focus(at + 2);
          at += 3;
        }
        chain.scrollIntoView().run();
      }
    } catch (err) {
      uploadError = err instanceof ApiError ? err.message : "Failed to upload image.";
    } finally {
      uploading = false;
    }
  }

  function onImagePick(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ""; // allow re-picking the same file later
    if (files.length) void uploadImages(files);
  }

  // Screenshots and copied images arrive as clipboard *files*, which ProseMirror
  // drops on the floor by default — so paste never worked. Intercept them and run
  // them through the normal upload path. Doing this even when the clipboard also
  // carries HTML means an image copied off a web page is rehosted here rather
  // than hotlinked from wherever it came from.
  function imageFilesFrom(data: DataTransfer | null): File[] {
    if (!data) return [];
    return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
  }

  function handlePaste(_view: Editor["view"], event: ClipboardEvent): boolean {
    const files = imageFilesFrom(event.clipboardData);
    if (!files.length) return false;
    event.preventDefault();
    void uploadImages(files);
    return true;
  }

  function handleDrop(view: Editor["view"], event: DragEvent, _slice: unknown, moved: boolean): boolean {
    if (moved) return false; // an internal node drag, not an external file
    const files = imageFilesFrom(event.dataTransfer);
    if (!files.length) return false;
    event.preventDefault();
    // Drop where the pointer is, not where the cursor happens to be.
    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
    void uploadImages(files, pos);
    return true;
  }

  onMount(() => {
    editor = new Editor({
      element,
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
      content,
      editorProps: {
        attributes: { class: "tiptap prose-omicron" },
        handlePaste,
        handleDrop,
      },
      onUpdate: ({ editor }) => {
        onUpdate(editor.getHTML(), editor.getJSON());
        refreshStats(editor);
      },
      onTransaction: ({ editor }) => refreshActive(editor),
    });
    refreshActive();
    // A reopened draft arrives with its body already in place, so the counter
    // has to start from that rather than from zero.
    refreshStats(editor);
    // The alt-text button lives inside a node view, so its event surfaces on
    // the editor's own DOM rather than anywhere Svelte can bind to directly.
    editor.view.dom.addEventListener(EDIT_ALT_EVENT, openAltDialog);
  });

  onDestroy(() => {
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
    { key: "list", icon: "list", label: "Bullet list", divider: true, run: () => editor.chain().focus().toggleBulletList().run() },
    { key: "orderedList", icon: "orderedList", label: "Numbered list", run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: "quote", icon: "quote", label: "Quote", run: () => editor.chain().focus().toggleBlockquote().run() },
    { key: "codeBlock", icon: "codeBlock", label: "Code block", run: () => editor.chain().focus().toggleCodeBlock().run() },
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
    "rounded-button data-[highlighted]:bg-muted !ring-0 !ring-transparent flex h-9 w-full cursor-pointer select-none items-center gap-2.5 px-2.5 text-sm font-medium focus-visible:outline-none";
</script>

<div>
  <Toolbar.Root class="rounded-10px border-border bg-background-alt shadow-mini no-scrollbar mb-4 flex w-full items-center justify-start gap-0.5 overflow-x-auto border px-2 py-1 sm:justify-between sm:gap-0">
    <!-- Text style: a single dropdown for normal text + Heading 1–6. -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={`${headingTrigger} ${headingLevel ? "text-foreground/80" : "text-foreground/60"}`}
        aria-label="Text style"
        title="Text style"
      >
        <Icon name={headingLevel ? (`h${headingLevel}` as IconName) : "heading"} size={18} />
        <Icon name="chevronDown" size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="start"
          class="border-muted bg-background shadow-popover z-30 w-[200px] rounded-xl border px-1 py-1.5 focus-visible:outline-none"
        >
          <DropdownMenu.Item
            onSelect={setParagraph}
            class={`${itemClass} ${headingLevel === 0 ? "bg-muted" : ""}`}
          >
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
        class={`${headingTrigger} text-foreground/60 max-w-[11rem] text-sm`}
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
          class={`${headingTrigger} text-foreground/60 text-sm`}
          aria-label="Edit table"
          title="Edit table"
        >
          <Icon name="table" size={16} class="shrink-0" />
          <span>Table</span>
          <Icon name="chevronDown" size={14} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={8}
            align="start"
            class="border-muted bg-background shadow-popover z-30 w-[200px] rounded-xl px-1 py-1.5 focus-visible:outline-none border"
          >
            {#each tableActions as action (action.label)}
              {#if action.divider}
                <DropdownMenu.Separator class="bg-border -mx-1 my-1 h-px" />
              {/if}
              <DropdownMenu.Item onSelect={action.run} class={itemClass}>
                <Icon name={action.icon} size={16} />
                {action.label}
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}

    <!-- Emoji picker. The web component is lazy-loaded on first open (see
         EmojiPicker.svelte), so it stays out of the editor's initial work. -->
    <EmojiTrigger onPick={insertEmoji} class={`${btn} text-foreground/60`} />
  </Toolbar.Root>

  <input
    bind:this={imageInput}
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    class="hidden"
    onchange={onImagePick}
  />

  {#if uploading}
    <p class="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
      <Icon name="spinner" size={15} class="animate-spin" /> Uploading image…
    </p>
  {/if}
  {#if uploadError}
    <p class="mb-3 text-sm text-destructive">{uploadError}</p>
  {/if}

  <div bind:this={element}></div>

  <!-- Bottom right, out of the way: read when wanted, ignored otherwise. -->
  <p class="text-muted-foreground mt-2 flex justify-end gap-2 text-xs tabular-nums">
    <span>{count(stats.characters, "character")}</span>
    <span aria-hidden="true">·</span>
    <span>{count(stats.words, "word")}</span>
    {#if stats.words > 0}
      <span aria-hidden="true">·</span>
      <span>{stats.minutes} min read</span>
    {/if}
  </p>
</div>

<Dialog.Root bind:open={codeOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[420px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Code block
      </Dialog.Title>
      <Dialog.Description class="text-muted-foreground mt-1 text-sm">
        The language colours the code. The filename shows above it, with the
        language's mark.
      </Dialog.Description>
      <form onsubmit={applyCodeSettings} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="code-language" class="text-sm font-medium leading-none">
            Language
          </Label.Root>
          <Select.Root type="single" bind:value={codeLanguage}>
            <Select.Trigger
              id="code-language"
              class="rounded-input border-border-input bg-background shadow-btn inline-flex h-10 w-full items-center justify-between gap-2 border px-3 text-sm outline-none transition-colors focus:border-foreground"
            >
              <span class="truncate">{selectedLanguageLabel}</span>
              <Icon name="chevronDown" size={15} class="text-muted-foreground shrink-0" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                class="border-muted bg-background shadow-popover rounded-card z-50 max-h-72 w-[--bits-select-anchor-width] overflow-y-auto border p-1"
                sideOffset={6}
              >
                <Select.Viewport>
                  <Select.Item
                    value=""
                    label="Auto-detect"
                    class="rounded-button data-[highlighted]:bg-muted flex h-9 w-full select-none items-center gap-2 px-2 text-sm outline-none"
                  >
                    {#snippet children({ selected: isSel })}
                      <span class="text-muted-foreground truncate">Auto-detect</span>
                      {#if isSel}
                        <Icon name="check" size={15} class="text-foreground ml-auto shrink-0" />
                      {/if}
                    {/snippet}
                  </Select.Item>
                  {#each CODE_LANGUAGES as lang (lang.value)}
                    <Select.Item
                      value={lang.value}
                      label={lang.label}
                      class="rounded-button data-[highlighted]:bg-muted flex h-9 w-full select-none items-center gap-2 px-2 text-sm outline-none"
                    >
                      {#snippet children({ selected: isSel })}
                        <span class="truncate">{lang.label}</span>
                        {#if isSel}
                          <Icon name="check" size={15} class="text-foreground ml-auto shrink-0" />
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
          <Label.Root for="code-title" class="text-sm font-medium leading-none">
            Filename <span class="text-muted-foreground font-normal">(optional)</span>
          </Label.Root>
          <input
            id="code-title"
            bind:value={codeTitle}
            type="text"
            maxlength={MAX_CODE_TITLE}
            placeholder="src/main.ts"
            class="rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <button
            type="submit"
            class="rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 inline-flex h-10 items-center justify-center px-5 text-sm font-semibold active:scale-[0.98]"
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
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[420px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Describe this image
      </Dialog.Title>
      <Dialog.Description class="text-muted-foreground mt-1 text-sm">
        Read aloud to people using a screen reader, and shown if the image fails to
        load. Leave it empty if the image is purely decorative.
      </Dialog.Description>
      <form onsubmit={applyAlt} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="image-alt" class="text-sm font-medium leading-none">
            Alt text
          </Label.Root>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="image-alt"
            bind:value={altText}
            type="text"
            placeholder="A rabbit peering out of its burrow"
            autofocus
            class="rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <button
            type="submit"
            class="rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 inline-flex h-10 items-center justify-center px-5 text-sm font-semibold active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root bind:open={linkOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[420px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Add link
      </Dialog.Title>
      <form onsubmit={applyLink} class="mt-4 flex flex-col gap-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="link-url" class="text-sm font-medium leading-none">URL</Label.Root>
          <!-- svelte-ignore a11y_autofocus -->
          <input
            id="link-url"
            bind:value={linkUrl}
            type="url"
            placeholder="https://example.com"
            autofocus
            class="rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>
        <div class="flex justify-end gap-2">
          <Dialog.Close
            class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <button
            type="submit"
            class="rounded-input bg-dark text-background shadow-mini hover:bg-dark/95 inline-flex h-10 items-center justify-center px-5 text-sm font-semibold active:scale-[0.98]"
          >
            Add link
          </button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>