<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Tabs } from "bits-ui";
  import PostCard from "$lib/components/PostCard.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const posts = $derived(data.results.posts);
  const people = $derived(data.results.people);
  // Open whichever tab has matches; default to Stories.
  const defaultTab = $derived(posts.length === 0 && people.length > 0 ? "people" : "stories");
</script>

<svelte:head>
  <title>{data.query ? `Search · ${data.query}` : "Search"} · Omicron</title>
</svelte:head>

{#if !data.query}
  <div class="py-20 text-center">
    <Icon name="search" size={32} class="text-muted-foreground mx-auto" />
    <p class="text-muted-foreground mt-3 text-sm">Search stories and people across the fediverse.</p>
  </div>
{:else}
  <header class="mb-4">
    <h1 class="text-foreground text-2xl font-bold tracking-tight">
      Results for <span class="italic">“{data.query}”</span>
    </h1>
  </header>

  {#key data.query}
    <Tabs.Root value={defaultTab} class="w-full">
      <Tabs.List class="mb-2 flex items-center gap-6 text-sm font-medium">
        <Tabs.Trigger
          value="stories"
          class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
        >
          <Icon name="read" size={16} /> Stories
          <span class="text-muted-foreground text-xs">{posts.length}</span>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="people"
          class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
        >
          <Icon name="user" size={16} /> People
          <span class="text-muted-foreground text-xs">{people.length}</span>
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="stories" class="pt-3">
        {#if posts.length === 0}
          <p class="text-muted-foreground py-10 text-center">No stories match “{data.query}”.</p>
        {:else}
          {#each posts as post (post.id)}
            <PostCard {post} />
          {/each}
        {/if}
      </Tabs.Content>

      <Tabs.Content value="people" class="pt-3">
        {#if people.length === 0}
          <p class="text-muted-foreground py-10 text-center">No people match “{data.query}”.</p>
        {:else}
          <ul class="divide-border divide-y">
            {#each people as person (person.id)}
              <li>
                <a
                  href={`/@${person.username}`}
                  class="hover:bg-muted -mx-3 flex min-w-0 items-center gap-3 rounded-card px-3 py-3 transition-colors"
                >
                  <Avatar name={person.displayName} src={person.avatarUrl ?? undefined} size={44} />
                  <span class="min-w-0">
                    <span class="text-foreground block truncate text-sm font-semibold">
                      {person.displayName}
                    </span>
                    <span class="text-muted-foreground block truncate text-xs">
                      @{person.username}
                    </span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  {/key}
{/if}
