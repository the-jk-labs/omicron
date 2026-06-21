<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";

  // Lazy-load the Tiptap editor so it stays out of the initial bundle.
  type EditorComp = typeof import("$lib/editor/Editor.svelte").default;
  let EditorComponent = $state<EditorComp | null>(null);
  onMount(async () => {
    EditorComponent = (await import("$lib/editor/Editor.svelte")).default;
  });

  let title = $state("");
  let html = $state("");
  let json = $state<unknown>(null);
  let error = $state("");
  let busy = $state(false);

  function onUpdate(h: string, j: unknown) {
    html = h;
    json = j;
  }

  async function publish() {
    if (!html.trim() || html === "<p></p>") {
      error = "Write something first.";
      return;
    }
    error = "";
    busy = true;
    try {
      const { post } = await endpoints().createPost({
        title: title.trim() || undefined,
        contentHtml: html,
        contentJson: json,
      });
      goto(`/posts/${post.id}`);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to publish.";
      busy = false;
    }
  }
</script>

<svelte:head><title>Write · Omicron</title></svelte:head>

<div class="mx-auto max-w-2xl">
  <div class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl font-bold tracking-tight text-neutral-900">Write a story</h1>
    <Button onclick={publish} disabled={busy} variant="solid">
      {busy ? "Publishing…" : "Publish"}
    </Button>
  </div>

  <input
    placeholder="Title"
    bind:value={title}
    class="mb-4 w-full border-none text-3xl font-bold tracking-tight text-neutral-900 placeholder:text-neutral-300 focus:outline-none"
  />

  <div>
    {#if EditorComponent}
      <EditorComponent {onUpdate} />
    {:else}
      <p class="text-neutral-500">Loading editor…</p>
    {/if}
  </div>

  {#if error}<p class="mt-3 text-sm text-red-600">{error}</p>{/if}
</div>
