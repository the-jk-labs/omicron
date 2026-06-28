<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { listPath } from "$lib/links";
  import type { ReadingList } from "$lib/types";

  // A single reading list in a grid, like a playlist card. Links to the list.
  let { list }: { list: ReadingList } = $props();

  const count = $derived(list.itemCount === 1 ? "1 post" : `${list.itemCount} posts`);
</script>

<a
  href={listPath(list)}
  class="group rounded-card border-border bg-background-alt hover:bg-muted flex flex-col gap-2 border p-4 transition-colors focus-visible:outline-none"
>
  <div class="flex items-start justify-between gap-2">
    <span
      class="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-card"
    >
      <Icon name={list.isReadLater ? "clock" : "bookmark"} size={18} />
    </span>
    {#if list.visibility === "private"}
      <span
        class="text-muted-foreground inline-flex items-center gap-1 text-xs"
        title="Private — only you can see this list"
      >
        <Icon name="lock" size={12} /> Private
      </span>
    {/if}
  </div>
  <h3 class="truncate font-semibold text-foreground group-hover:text-foreground-alt">
    {list.title}
  </h3>
  {#if list.description}
    <p class="line-clamp-2 text-sm text-muted-foreground">{list.description}</p>
  {/if}
  <p class="mt-auto pt-1 text-xs text-muted-foreground">{count}</p>
</a>
