<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import { listPath } from "#lib/links.js";
  import type { ReadingList } from "#lib/types.js";

  // A single reading list in a grid, like a playlist card. Links to the list.
  let { list }: { list: ReadingList } = $props();

  const count = $derived(list.itemCount === 1 ? "1 post" : `${list.itemCount} posts`);
</script>

<!-- As on a post card: the title is the link, stretched over the card, so the link's name is its visible text. -->
<div
  class="group relative flex flex-col gap-2 rounded-card border border-border bg-background-alt p-4 transition-colors hover:bg-muted"
>
  <div class="flex items-start justify-between gap-2">
    <span class="flex size-9 shrink-0 items-center justify-center rounded-card bg-muted text-muted-foreground">
      <Icon name={list.isReadLater ? "clock" : "bookmark"} size={18} />
    </span>
    {#if list.visibility === "private"}
      <span
        class="inline-flex items-center gap-1 text-xs text-muted-foreground"
        title="Private. Only you can see this list"
      >
        <Icon name="lock" size={12} /> Private
      </span>
    {/if}
  </div>
  <h3 class="truncate font-semibold text-foreground group-hover:text-foreground-alt">
    <a href={listPath(list)} class="after:absolute after:inset-0">{list.title}</a>
  </h3>
  {#if list.description}
    <p class="line-clamp-2 text-sm text-muted-foreground">{list.description}</p>
  {/if}
  <p class="mt-auto pt-1 text-xs text-muted-foreground">{count}</p>
</div>
