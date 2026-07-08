<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { untrack } from "svelte";
  import { endpoints, ApiError } from "$lib/api";
  import { confirm } from "$lib/components/ui/confirm";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { excerpt, formatDateTime } from "$lib/format";
  import type { Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let drafts = $state<Post[]>(untrack(() => data.page.items));
  let cursor = $state<string | null>(untrack(() => data.page.nextCursor));
  let loading = $state(false);
  let error = $state("");
  // Reset when the page data is reloaded (e.g. after invalidation); "load more"
  // appends to `drafts` without changing `data`, so it isn't undone.
  $effect(() => {
    drafts = data.page.items;
    cursor = data.page.nextCursor;
  });

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const next = await endpoints().drafts(cursor);
      drafts = [...drafts, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }

  async function remove(draft: Post) {
    const ok = await confirm({
      title: "Delete draft",
      description: "Delete this draft? This can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await endpoints().deletePost(draft.id);
      drafts = drafts.filter((d) => d.id !== draft.id);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to delete draft.";
    }
  }
</script>

<svelte:head><title>Drafts · Omicron</title></svelte:head>

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="draft" size={22} /> Drafts
  </h1>
  <p class="mt-1 text-muted-foreground">Unpublished posts, visible only to you.</p>
</header>

{#if error}<p class="mb-4 text-sm text-destructive">{error}</p>{/if}

{#if drafts.length === 0}
  <div class="rounded-card border border-border bg-background-alt px-6 py-12 text-center">
    <p class="text-muted-foreground">You don't have any drafts yet.</p>
    <Button href="/compose" variant="solid" class="mt-4">Start writing</Button>
  </div>
{:else}
  <ul class="space-y-2">
    {#each drafts as draft (draft.id)}
      <li class="flex items-start justify-between gap-4 rounded-card px-4 py-5 transition-colors hover:bg-muted">
        <Button href={`/compose?id=${draft.id}`} variant="plain" class="group block min-w-0 flex-1 text-left">
          <h2 class="truncate text-xl font-bold leading-snug text-foreground group-hover:text-foreground-alt">
            {draft.title?.trim() || "Untitled draft"}
          </h2>
          {#if excerpt(draft.contentHtml)}
            <p class="mt-1.5 line-clamp-2 text-muted-foreground">{excerpt(draft.contentHtml)}</p>
          {/if}
          <span class="mt-3 block text-xs text-muted-foreground">
            Last edited {formatDateTime(draft.createdAt)}
          </span>
        </Button>
        <div class="flex shrink-0 items-center gap-2 self-center">
          <Button href={`/compose?id=${draft.id}`} variant="outline" size="sm">
            <Icon name="edit" size={15} /> Continue
          </Button>
          <Button
            onclick={() => remove(draft)}
            variant="ghost"
            aria-label="Delete draft"
            title="Delete draft"
            class="inline-flex size-9 items-center justify-center !px-0 text-muted-foreground hover:text-destructive"
          >
            <Icon name="trash" size={16} />
          </Button>
        </div>
      </li>
    {/each}
  </ul>

  {#if cursor}
    <div class="mt-8 flex justify-center">
      <Button onclick={loadMore} disabled={loading} variant="outline">
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  {/if}
{/if}
