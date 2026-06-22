<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { Content } from "@tiptap/core";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const post = data.post;

  // Lazy-load the Tiptap editor so it stays out of the initial bundle.
  type EditorComp = typeof import("$lib/editor/Editor.svelte").default;
  let EditorComponent = $state<EditorComp | null>(null);
  onMount(async () => {
    EditorComponent = (await import("$lib/editor/Editor.svelte")).default;
  });

  let title = $state(post.title ?? "");
  let html = $state(post.contentHtml);
  let json = $state<unknown>(post.contentJson ?? null);
  let error = $state("");
  let busy = $state(false);

  function onUpdate(h: string, j: unknown) {
    html = h;
    json = j;
  }

  async function save() {
    if (!html.trim() || html === "<p></p>") {
      error = "Write something first.";
      return;
    }
    error = "";
    busy = true;
    try {
      await endpoints().updatePost(post.id, {
        title: title.trim() || undefined,
        contentHtml: html,
        contentJson: json,
      });
      goto(`/posts/${post.id}`);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to save.";
      busy = false;
    }
  }
</script>

<svelte:head><title>Edit · Omicron</title></svelte:head>

<div class="mb-8 flex items-center justify-between">
  <p class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
    <Icon name="edit" size={16} /> Editing
  </p>
  <div class="flex items-center gap-2">
    <Button href={`/posts/${post.id}`} variant="ghost">Cancel</Button>
    <Button onclick={save} disabled={busy} variant="solid">
      {busy ? "Saving…" : "Save"}
    </Button>
  </div>
</div>

<input
  placeholder="Title"
  bind:value={title}
  class="mb-6 w-full border-none bg-transparent text-4xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none"
/>

{#if EditorComponent}
  <EditorComponent {onUpdate} content={(post.contentJson as Content) ?? post.contentHtml} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}