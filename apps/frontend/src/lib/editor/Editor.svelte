<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Editor } from "@tiptap/core";
  import { Separator, Toolbar } from "bits-ui";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import { extensions } from "./extensions";

  // Isolated Tiptap integration. The parent receives content via `onUpdate`.
  // This component is lazy-loaded (dynamic import) so Tiptap stays out of the
  // initial bundle — see /compose.
  let {
    onUpdate,
    placeholder = "Tell your story…",
    content,
  }: {
    onUpdate: (html: string, json: unknown) => void;
    placeholder?: string;
    content?: string;
  } = $props();

  let element: HTMLDivElement;
  let editor: Editor;

  // Reflects which marks/blocks are active at the cursor, refreshed on every
  // Tiptap transaction so the toolbar buttons stay in sync.
  let active = $state({ h1: false, h2: false, bold: false, italic: false, list: false, quote: false });

  function refreshActive() {
    active = {
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      list: editor.isActive("bulletList"),
      quote: editor.isActive("blockquote"),
    };
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

  type Tool = { key: keyof typeof active; icon: IconName; label: string; run: () => void };
  const tools: Tool[] = [
    { key: "h1", icon: "h1", label: "Heading 1", run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { key: "h2", icon: "h2", label: "Heading 2", run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { key: "bold", icon: "bold", label: "Bold", run: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", icon: "italic", label: "Italic", run: () => editor.chain().focus().toggleItalic().run() },
    { key: "list", icon: "list", label: "Bullet list", run: () => editor.chain().focus().toggleBulletList().run() },
    { key: "quote", icon: "quote", label: "Quote", run: () => editor.chain().focus().toggleBlockquote().run() },
  ];

  const btn =
    "rounded-9px bg-background-alt hover:bg-muted active:bg-dark-10 inline-flex size-10 items-center justify-center transition-all active:scale-[0.98]";
</script>

<div>
  <Toolbar.Root class="rounded-10px border-border bg-background-alt shadow-mini mb-4 flex min-w-max items-center gap-x-0.5 border px-[4px] py-1">
    {#each tools as tool (tool.key)}
      {#if tool.key === "bold"}
        <Separator.Root orientation="vertical" class="bg-border mx-1 shrink-0 data-[orientation=vertical]:h-7 data-[orientation=vertical]:w-px" />
      {/if}
      <Toolbar.Button
        onclick={tool.run}
        aria-label={tool.label}
        aria-pressed={active[tool.key]}
        class={`${btn} ${active[tool.key] ? "bg-muted text-foreground/80" : "text-foreground/60"}`}
      >
        <Icon name={tool.icon} size={18} />
      </Toolbar.Button>
    {/each}
  </Toolbar.Root>
  <div bind:this={element}></div>
</div>
