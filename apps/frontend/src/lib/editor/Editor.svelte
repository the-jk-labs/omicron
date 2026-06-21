<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Editor } from "@tiptap/core";
  import { Toggle } from "bits-ui";
  import { extensions } from "./extensions";

  // Isolated Tiptap integration. The parent receives content via `onUpdate`.
  // This component is lazy-loaded (dynamic import) so Tiptap stays out of the
  // initial bundle — see /compose.
  let {
    onUpdate,
    placeholder = "Tell your story…",
  }: { onUpdate: (html: string, json: unknown) => void; placeholder?: string } = $props();

  let element: HTMLDivElement;
  let editor: Editor;

  // Reflects which marks/blocks are active at the cursor, refreshed on every
  // Tiptap transaction so the bits-ui Toggle buttons stay in sync.
  let active = $state({ h1: false, h2: false, bold: false, italic: false, bulletList: false, blockquote: false });

  function refreshActive() {
    active = {
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      bulletList: editor.isActive("bulletList"),
      blockquote: editor.isActive("blockquote"),
    };
  }

  onMount(() => {
    editor = new Editor({
      element,
      extensions,
      editorProps: { attributes: { class: "tiptap prose-omicron", "data-placeholder": placeholder } },
      onUpdate: ({ editor }) => onUpdate(editor.getHTML(), editor.getJSON()),
      onTransaction: refreshActive,
    });
    refreshActive();
  });

  onDestroy(() => editor?.destroy());
</script>

<div>
  <div class="mb-3 flex gap-1 border-b border-neutral-200 pb-3">
    <Toggle.Root
      pressed={active.h1}
      onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      class="rounded-md px-2.5 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 data-[state=on]:bg-neutral-200 data-[state=on]:text-neutral-900"
    >H1</Toggle.Root>
    <Toggle.Root
      pressed={active.h2}
      onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      class="rounded-md px-2.5 py-1.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 data-[state=on]:bg-neutral-200 data-[state=on]:text-neutral-900"
    >H2</Toggle.Root>
    <Toggle.Root
      pressed={active.bold}
      onPressedChange={() => editor.chain().focus().toggleBold().run()}
      class="rounded-md px-2.5 py-1.5 text-sm font-bold text-neutral-600 hover:bg-neutral-100 data-[state=on]:bg-neutral-200 data-[state=on]:text-neutral-900"
    >B</Toggle.Root>
    <Toggle.Root
      pressed={active.italic}
      onPressedChange={() => editor.chain().focus().toggleItalic().run()}
      class="rounded-md px-2.5 py-1.5 text-sm italic text-neutral-600 hover:bg-neutral-100 data-[state=on]:bg-neutral-200 data-[state=on]:text-neutral-900"
    >i</Toggle.Root>
    <Toggle.Root
      pressed={active.bulletList}
      onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
      class="rounded-md px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 data-[state=on]:bg-neutral-200 data-[state=on]:text-neutral-900"
    >• List</Toggle.Root>
    <Toggle.Root
      pressed={active.blockquote}
      onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
      class="rounded-md px-2.5 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 data-[state=on]:bg-neutral-200 data-[state=on]:text-neutral-900"
    >❝</Toggle.Root>
  </div>
  <div bind:this={element}></div>
</div>
