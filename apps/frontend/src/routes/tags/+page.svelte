<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { TagWithCount } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Tags · Omicron</title></svelte:head>

<header class="mb-6">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="tag" size={22} class="text-muted-foreground" /> Tags
  </h1>
  <p class="mt-1 text-sm text-muted-foreground">
    Browse and follow topics from across the fediverse.
  </p>
</header>

{#snippet tagList(tags: TagWithCount[], empty: string)}
  {#if tags.length === 0}
    <p class="py-10 text-center text-sm text-muted-foreground">{empty}</p>
  {:else}
    <ul class="divide-border divide-y">
      {#each tags as tag (tag.slug)}
        <li>
          <a
            href={`/tags/${tag.slug}`}
            class="hover:bg-muted -mx-3 flex min-w-0 items-center gap-3 rounded-card px-3 py-3 transition-colors"
          >
            <span
              class="bg-muted text-foreground-alt flex size-11 shrink-0 items-center justify-center rounded-full"
            >
              <Icon name="tag" size={20} />
            </span>
            <span class="min-w-0">
              <span class="text-foreground block truncate text-sm font-semibold">#{tag.name}</span>
              <span class="text-muted-foreground block truncate text-xs">
                {tag.postCount}
                {tag.postCount === 1 ? "story" : "stories"}
              </span>
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#if data.user && data.followed.length}
  <section class="mb-8">
    <h2 class="text-foreground mb-1 text-base font-semibold">Following</h2>
    {@render tagList(data.followed, "You don't follow any tags yet.")}
  </section>
{/if}

<section>
  <h2 class="text-foreground mb-1 text-base font-semibold">Trending</h2>
  {@render tagList(data.trending, "No trending tags yet — be the first to tag a story.")}
</section>
