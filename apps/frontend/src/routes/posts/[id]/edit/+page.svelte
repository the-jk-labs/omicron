<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { Content } from "@tiptap/core";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import TagInput from "$lib/components/TagInput.svelte";
  import LanguageSelect from "$lib/components/LanguageSelect.svelte";
  import { postPath } from "$lib/links";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  // Seed the editor once from the loaded post; later edits live in the editor.
  const post = untrack(() => data.post);

  // Lazy-load the Tiptap editor so it stays out of the initial bundle.
  type EditorComp = typeof import("$lib/editor/Editor.svelte").default;
  let EditorComponent = $state<EditorComp | null>(null);
  onMount(async () => {
    EditorComponent = (await import("$lib/editor/Editor.svelte")).default;
  });

  let title = $state(post.title ?? "");
  let tags = $state<string[]>(post.tags?.map((t) => t.name) ?? []);
  let language = $state<string | null>(post.language ?? null);
  let html = $state(post.contentHtml);
  let json = $state<unknown>(post.contentJson ?? null);
  let error = $state("");
  let busy = $state(false);

  function onUpdate(h: string, j: unknown) {
    html = h;
    json = j;
  }

  async function save() {
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
      await endpoints().updatePost(post.id, {
        title: title.trim(),
        contentHtml: html,
        contentJson: json,
        language,
        tags,
      });
      // Title may have changed, so navigate to the freshly-built canonical path.
      goto(postPath({ ...post, title: title.trim() }));
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
    <Button href={postPath(post)} variant="ghost">Cancel</Button>
    <Button onclick={save} disabled={busy} variant="solid">
      {busy ? "Saving…" : "Save"}
    </Button>
  </div>
</div>

<input
  placeholder="Title"
  bind:value={title}
  class="mb-6 w-full border-none bg-transparent text-3xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-4xl"
/>

<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    <TagInput bind:tags />
  </div>
  <LanguageSelect bind:value={language} />
</div>

{#if EditorComponent}
  <EditorComponent {onUpdate} content={(post.contentJson as Content) ?? post.contentHtml} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}