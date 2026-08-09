<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";

  // Matches SUMMARY_LENGTH in the backend (lib/webhook.ts).
  const MAX_SUMMARY = 150;
  import type { Content } from "@tiptap/core";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import TagInput from "$lib/components/TagInput.svelte";
  import LanguageSelect from "$lib/components/LanguageSelect.svelte";
  import BannerPicker from "$lib/components/BannerPicker.svelte";
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
  // Seeded from the stored value, and always sent back — omitting the field
  // would leave it untouched, but an author who cleared it here must have the
  // clearing saved, and one who never touches it must not lose what they wrote.
  let summary = $state(post.summary ?? "");
  // Seeded from the *chosen* banner, never the resolved one — a post that has
  // been showing its first body image must not have that turned into an
  // explicit choice just because someone opened the editor.
  let coverUrl = $state<string | null>(post.coverUrl ?? null);
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
        summary: summary.trim() || null,
        coverUrl,
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

<PageTitle text="Edit" />

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

<div class="mb-6">
  <label for="post-summary" class="text-muted-foreground mb-1.5 block text-xs font-medium">
    Description — shown in search results and link previews. Optional; the opening
    lines are used when it's blank.
  </label>
  <div class="flex items-center gap-3">
    <input
      id="post-summary"
      bind:value={summary}
      maxlength={MAX_SUMMARY}
      placeholder="One sentence on what this post is about"
      class="rounded-input border border-input bg-background shadow-btn min-w-0 flex-1 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
    />
    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
      {summary.length}/{MAX_SUMMARY}
    </span>
  </div>
</div>

<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    <TagInput bind:tags />
  </div>
  <LanguageSelect bind:value={language} />
</div>

<BannerPicker bind:coverUrl contentHtml={html} />

{#if EditorComponent}
  <EditorComponent {onUpdate} content={(post.contentJson as Content) ?? post.contentHtml} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}