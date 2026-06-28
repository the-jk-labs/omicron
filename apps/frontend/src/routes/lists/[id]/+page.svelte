<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import ListFormDialog from "$lib/components/ListFormDialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import type { Post, ReadingList } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let list = $state<ReadingList>(data.list);
  let posts = $state<Post[]>(data.page.items);
  let cursor = $state<string | null>(data.page.nextCursor);
  let loading = $state(false);

  const count = $derived(list.itemCount === 1 ? "1 post" : `${list.itemCount} posts`);

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const next = await endpoints().listItems(list.id, cursor);
      posts = [...posts, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }

  function onSaved(updated: ReadingList) {
    list = { ...list, ...updated };
  }

  async function removeList() {
    const ok = await confirm({
      title: "Delete list",
      description: `Delete "${list.title}"? This can't be undone. Your saved stories aren't deleted.`,
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await endpoints().deleteList(list.id);
    goto("/lists");
  }
</script>

<svelte:head><title>{list.title} · Omicron</title></svelte:head>

<header class="mb-8 border-b border-border pb-6">
  <a
    href={data.isOwner ? "/lists" : `/@${data.owner.username}`}
    class="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
  >
    <Icon name="library" size={15} />
    {data.isOwner ? "Your lists" : data.owner.displayName}
  </a>

  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">{list.title}</h1>
      {#if list.description}
        <p class="mt-2 max-w-prose whitespace-pre-line text-foreground-alt">{list.description}</p>
      {/if}
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>{count}</span>
        <span class="flex items-center gap-1">
          <Icon name={list.visibility === "private" ? "lock" : "globe"} size={14} />
          {list.visibility === "private" ? "Private" : "Public"}
        </span>
        {#if !data.isOwner}
          <span>by <a href={`/@${data.owner.username}`} class="text-foreground hover:underline">{data.owner.displayName}</a></span>
        {/if}
      </div>
    </div>

    {#if data.isOwner}
      <div class="flex shrink-0 items-center gap-2">
        <ListFormDialog {list} {onSaved}>
          {#snippet children(props)}
            <Button {...props} variant="outline" size="sm">
              <Icon name="edit" size={15} /> Edit
            </Button>
          {/snippet}
        </ListFormDialog>
        {#if !list.isReadLater}
          <Button variant="outline" size="sm" onclick={removeList} aria-label="Delete list">
            <Icon name="trash" size={15} />
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</header>

{#if posts.length === 0}
  <p class="py-16 text-center text-muted-foreground">
    {data.isOwner ? "No stories saved yet. Use the bookmark on any story to add it here." : "This list is empty."}
  </p>
{:else}
  {#each posts as post (post.id)}
    <PostCard {post} />
  {/each}
  {#if cursor}
    <div class="mt-8 flex justify-center">
      <Button onclick={loadMore} disabled={loading} variant="outline">
        {loading ? "Loading…" : "Show more"}
      </Button>
    </div>
  {/if}
{/if}
