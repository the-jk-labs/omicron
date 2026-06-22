<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { type Content, Editor } from "@tiptap/core";
  import { Separator, Toolbar } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
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

  // Prompts for a URL and toggles a link on the current selection.
  function toggleLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt("Link URL");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions,
      content,
      editorProps: { attributes: { class: "tiptap prose-omicron", "data-placeholder": placeholder } },
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
    { icon: "hr", label: "Divider", divider: true, run: () => editor.chain().focus().setHorizontalRule().run() },
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
  <div bind:this={element}></div>
</div>
