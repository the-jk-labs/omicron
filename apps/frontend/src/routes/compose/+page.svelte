<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";

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
    if (!title.trim()) {
      error = "A blog post must have a title.";
      return;
    }
    if (!html.trim() || html === "<p></p>") {
      error = "Write something first.";
      return;
    }
    error = "";
    busy = true;
    try {
      const { post } = await endpoints().createPost({
        title: title.trim(),
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

<div class="mb-8 flex items-center justify-between">
  <p class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
    <Icon name="compose" size={16} /> Draft
  </p>
  <Button onclick={publish} disabled={busy} variant="solid">
    {busy ? "Publishing…" : "Publish"}
  </Button>
</div>

<input
  placeholder="Title"
  bind:value={title}
  class="mb-6 w-full border-none bg-transparent text-4xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none"
/>

{#if EditorComponent}
  <EditorComponent {onUpdate} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}