<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { untrack } from "svelte";
  import { Tabs } from "bits-ui";
  import { goto } from "$app/navigation";
  import PostCard from "$lib/components/PostCard.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const posts = $derived(data.results.posts);
  const people = $derived(data.results.people);
  const tags = $derived(data.results.tags);
  // Open whichever tab has matches; default to Articles, then Tags, then People.
  const defaultTab = $derived(
    posts.length > 0
      ? "articles"
      : tags.length > 0
        ? "tags"
        : people.length > 0
          ? "people"
          : "articles",
  );

  // The nav's search pill is hidden below `sm`, so on mobile this page is the
  // only place to type a query. Seed it from the active query and search live
  // as the user types — debounced so we don't refetch on every keystroke.
  // The page's load function owns the actual results.
  let query = $state(untrack(() => data.query ?? ""));
  // Keep the field in sync when the active query changes via navigation (a link
  // or Back/Forward); reacts to `data.query` only, so live typing is untouched.
  $effect(() => {
    query = data.query ?? "";
  });

  function run(q: string) {
    // replaceState keeps the query out of history so Back doesn't step through
    // every keystroke; keepFocus leaves the field active as results stream in.
    goto(q ? `/search?q=${encodeURIComponent(q)}` : "/search", {
      keepFocus: true,
      replaceState: true,
    });
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    run(query.trim());
  }

  $effect(() => {
    const q = query.trim();
    if (q === (data.query ?? "")) return; // already showing this query
    const t = setTimeout(() => run(q), 250);
    return () => clearTimeout(t);
  });
</script>

<svelte:head>
  <title>{data.query ? `Search · ${data.query}` : "Search"} · Omicron</title>
</svelte:head>

<!-- Mobile-only search field (nav pill is hidden below `sm`). Autofocuses on
     the empty state so tapping search in the nav lands ready to type. -->
<form onsubmit={submit} role="search" class="mb-6 sm:hidden">
  <div
    class="bg-muted/60 focus-within:bg-muted flex h-11 items-center gap-2.5 rounded-full px-4 transition-colors"
  >
    <Icon name="search" size={18} class="text-muted-foreground shrink-0" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      bind:value={query}
      type="search"
      placeholder="Search"
      aria-label="Search articles and people"
      autofocus={!data.query}
      class="placeholder:text-muted-foreground w-full bg-transparent text-[15px] outline-none"
    />
  </div>
</form>

{#if !data.query}
  <div class="py-20 text-center">
    <Icon name="search" size={32} class="text-muted-foreground mx-auto" />
    <p class="text-muted-foreground mt-3 text-sm">Search articles and people across the fediverse.</p>
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
          value="articles"
          class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
        >
          <Icon name="read" size={16} /> Articles
          <span class="text-muted-foreground text-xs">{posts.length}</span>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="tags"
          class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
        >
          <Icon name="tag" size={16} /> Tags
          <span class="text-muted-foreground text-xs">{tags.length}</span>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="people"
          class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
        >
          <Icon name="user" size={16} /> People
          <span class="text-muted-foreground text-xs">{people.length}</span>
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="articles" class="pt-3">
        {#if posts.length === 0}
          <p class="text-muted-foreground py-10 text-center">No articles match “{data.query}”.</p>
        {:else}
          {#each posts as post (post.id)}
            <PostCard {post} />
          {/each}
        {/if}
      </Tabs.Content>

      <Tabs.Content value="tags" class="pt-3">
        {#if tags.length === 0}
          <p class="text-muted-foreground py-10 text-center">No tags match “{data.query}”.</p>
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
                    <span class="text-foreground block truncate text-sm font-semibold">
                      #{tag.name}
                    </span>
                    <span class="text-muted-foreground block truncate text-xs">
                      {tag.postCount}
                      {tag.postCount === 1 ? "article" : "articles"}
                    </span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
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
