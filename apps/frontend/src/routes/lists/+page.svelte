<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { untrack } from "svelte";
  import ReadingListCard from "$lib/components/ReadingListCard.svelte";
  import ListFormDialog from "$lib/components/ListFormDialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { ReadingList } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let lists = $state<ReadingList[]>(untrack(() => data.lists));
  // Re-sync when the page data reloads; local create/delete mutate `lists`.
  $effect(() => {
    lists = data.lists;
  });

  // A freshly created list lands at the top (after the pinned Read later list).
  function onCreated(list: ReadingList) {
    const readLater = lists.filter((l) => l.isReadLater);
    const rest = lists.filter((l) => !l.isReadLater);
    lists = [...readLater, list, ...rest];
  }
</script>

<svelte:head><title>Your lists · Omicron</title></svelte:head>

<div class="mb-6 flex items-center justify-between gap-3">
  <h1 class="text-2xl font-bold tracking-tight text-foreground">Your lists</h1>
  <ListFormDialog onSaved={onCreated}>
    {#snippet children(props)}
      <Button {...props} variant="solid" size="sm">
        <Icon name="plus" size={16} /> New list
      </Button>
    {/snippet}
  </ListFormDialog>
</div>

{#if lists.length === 0}
  <p class="py-16 text-center text-muted-foreground">
    You don't have any lists yet. Create one to start saving stories.
  </p>
{:else}
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each lists as list (list.id)}
      <ReadingListCard {list} />
    {/each}
  </div>
{/if}
