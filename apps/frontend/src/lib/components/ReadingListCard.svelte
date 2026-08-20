<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { listPath } from "$lib/links";
  import type { ReadingList } from "$lib/types";

  // A single reading list in a grid, like a playlist card. Links to the list.
  let { list }: { list: ReadingList } = $props();

  const count = $derived(list.itemCount === 1 ? "1 post" : `${list.itemCount} posts`);

  // As on a post card: the whole card is one link, so without this its
  // accessible name is every scrap of text in it — "Private <title>
  // <description> 3 posts". The title is what distinguishes one card from
  // another; the rest is visible beside it either way.
  const titleId = $props.id();
</script>

<a
  href={listPath(list)}
  aria-labelledby={titleId}
  class="group flex flex-col gap-2 rounded-card border border-border bg-background-alt p-4 transition-colors hover:bg-muted focus-visible:outline-hidden"
>
  <div class="flex items-start justify-between gap-2">
    <span class="flex size-9 shrink-0 items-center justify-center rounded-card bg-muted text-muted-foreground">
      <Icon name={list.isReadLater ? "clock" : "bookmark"} size={18} />
    </span>
    {#if list.visibility === "private"}
      <span
        class="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title="Private — only you can see this list"
      >
        <Icon name="lock" size={12} /> Private
      </span>
    {/if}
  </div>
  <h3 id={titleId} class="truncate font-semibold text-foreground group-hover:text-foreground-alt">
    {list.title}
  </h3>
  {#if list.description}
    <p class="line-clamp-2 text-sm text-muted-foreground">{list.description}</p>
  {/if}
  <p class="mt-auto pt-1 text-xs text-muted-foreground">{count}</p>
</a>
