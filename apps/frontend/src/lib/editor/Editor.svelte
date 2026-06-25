<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { type Content, Editor } from "@tiptap/core";
  import Placeholder from "@tiptap/extension-placeholder";
  import { Dialog, Label, Separator, Toolbar } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import { endpoints, ApiError } from "$lib/api";
  import { ACCEPTED_IMAGE_TYPES, prepareImage } from "./image";
  import { extensions } from "./extensions";

  // Isolated Tiptap integration. The parent receives content via `onUpdate`.
  // This component is lazy-loaded (dynamic import) so Tiptap stays out of the
  // initial bundle — see /compose.
  //
  // `content` should be Tiptap's native JSON (ProseMirror doc) when rehydrating
  // an existing post — a plain string is parsed as Markdown by the markdown
  // extension, so passing stored HTML as a string would show the tags verbatim.
  let {
    onUpdate,
    placeholder = "Tell your story…",
    content,
  }: {
    onUpdate: (html: string, json: unknown) => void;
    placeholder?: string;
    content?: Content;
  } = $props();

  let element: HTMLDivElement;
  let editor: Editor;

  // Reflects which marks/blocks are active at the cursor, refreshed on every
  // Tiptap transaction so the toolbar buttons stay in sync.
  let active = $state({
    h1: false,
    h2: false,
    h3: false,
    bold: false,
    italic: false,
    strike: false,
    code: false,
    list: false,
    orderedList: false,
    quote: false,
    codeBlock: false,
    link: false,
  });

  function refreshActive() {
    active = {
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      list: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      quote: editor.isActive("blockquote"),
      codeBlock: editor.isActive("codeBlock"),
      link: editor.isActive("link"),
    };
  }

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

  // Image upload: the picked file is resized/compressed in the browser (see
  // image.ts), uploaded, then inserted at the cursor as an image node.
  let imageInput = $state<HTMLInputElement | null>(null);
  let uploading = $state(false);
  let uploadError = $state("");

  async function onImagePick(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      uploadError = "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
      return;
    }
    uploadError = "";
    uploading = true;
    try {
      const { blob, type } = await prepareImage(file);
      const { url } = await endpoints().uploadImage(blob, type);
      // Insert the image together with a trailing paragraph, then move the cursor
      // into that fresh line and scroll it into view so the author can keep
      // writing immediately — just like a normal editor.
      editor
        .chain()
        .insertContent([
          { type: "image", attrs: { src: url } },
          { type: "paragraph" },
        ])
        .focus("end")
        .scrollIntoView()
        .run();
    } catch (err) {
      uploadError = err instanceof ApiError ? err.message : "Failed to upload image.";
    } finally {
      uploading = false;
    }
  }

  onMount(() => {
    editor = new Editor({
      element,
      // Placeholder is per-instance (it needs the `placeholder` prop), so it's
      // appended to the shared base extensions here. The first line shows the
      // story prompt; every other empty line (e.g. below an image) shows a
      // generic hint, so there's always a visible caret target.
      extensions: [
        ...extensions,
        Placeholder.configure({
          placeholder: ({ pos }) => (pos === 0 ? placeholder : "Write something…"),
        }),
      ],
      content,
      editorProps: { attributes: { class: "tiptap prose-omicron" } },
      onUpdate: ({ editor }) => onUpdate(editor.getHTML(), editor.getJSON()),
      onTransaction: refreshActive,
    });
    refreshActive();
  });

  onDestroy(() => editor?.destroy());

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
    { key: "h1", icon: "h1", label: "Heading 1", run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: "h2", icon: "h2", label: "Heading 2", run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "h3", icon: "h3", label: "Heading 3", run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { key: "bold", icon: "bold", label: "Bold", divider: true, run: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", icon: "italic", label: "Italic", run: () => editor.chain().focus().toggleItalic().run() },
    { key: "strike", icon: "strike", label: "Strikethrough", run: () => editor.chain().focus().toggleStrike().run() },
    { key: "code", icon: "code", label: "Inline code", run: () => editor.chain().focus().toggleCode().run() },
    { key: "link", icon: "link", label: "Link", run: toggleLink },
    { key: "list", icon: "list", label: "Bullet list", divider: true, run: () => editor.chain().focus().toggleBulletList().run() },
    { key: "orderedList", icon: "orderedList", label: "Numbered list", run: () => editor.chain().focus().toggleOrderedList().run() },
    { key: "quote", icon: "quote", label: "Quote", run: () => editor.chain().focus().toggleBlockquote().run() },
    { key: "codeBlock", icon: "codeBlock", label: "Code block", run: () => editor.chain().focus().toggleCodeBlock().run() },
    { icon: "image", label: "Image", divider: true, run: () => imageInput?.click() },
    { icon: "hr", label: "Divider", run: () => editor.chain().focus().setHorizontalRule().run() },
  ];

  const btn =
    "rounded-9px bg-background-alt hover:bg-muted active:bg-dark-10 inline-flex size-10 items-center justify-center transition-all active:scale-[0.98]";
</script>

<div>
  <Toolbar.Root class="rounded-10px border-border bg-background-alt shadow-mini mb-4 flex min-w-max items-center gap-x-0.5 border px-[4px] py-1">
    {#each tools as tool (tool.label)}
      {#if tool.divider}
        <Separator.Root orientation="vertical" class="bg-border mx-1 shrink-0 data-[orientation=vertical]:h-7 data-[orientation=vertical]:w-px" />
      {/if}
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
</div>

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