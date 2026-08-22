<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import PostCard from "$lib/components/PostCard.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import { Tabs } from "bits-ui";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const posts = $derived(data.results.posts);
  const people = $derived(data.results.people);
  const tags = $derived(data.results.tags);
  // Open whichever tab has matches; default to Articles, then Tags, then People.
  const defaultTab = $derived(
    posts.length > 0 ? "articles" : tags.length > 0 ? "tags" : people.length > 0 ? "people" : "articles",
  );

  // The nav's search pill is hidden below `sm`, so on mobile this page is the
  // only place to type a query. Seed it from the active query and search live
  // as the user types — debounced so we don't refetch on every keystroke.
  // The page's load function owns the actual results.
  let query = $state(untrack(() => data.query ?? ""));
  // Tag & author narrow only the Articles tab (see +page.ts). Seeded from the URL
  // and kept in sync on navigation; live-typed values are debounced like `query`.
  let tagFilter = $state(untrack(() => (data as { tag?: string }).tag ?? ""));
  let authorFilter = $state(untrack(() => (data as { author?: string }).author ?? ""));

  // Keep fields in sync when the active query/filters change via navigation
  // (a link or Back/Forward); don't fight live typing when the field is focused.
  $effect(() => {
    if (document.activeElement?.getAttribute("data-search-input") !== "q") query = data.query ?? "";
  });
  $effect(() => {
    const t = (data as { tag?: string }).tag ?? "";
    if (document.activeElement?.getAttribute("data-search-input") !== "tag") tagFilter = t;
  });
  $effect(() => {
    const a = (data as { author?: string }).author ?? "";
    if (document.activeElement?.getAttribute("data-search-input") !== "author") authorFilter = a;
  });

  function buildUrl(q: string, tag: string, author: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (tag) params.set("tag", tag);
    if (author) params.set("author", author);
    const qs = params.toString();
    return qs ? `/search?${qs}` : "/search";
  }

  function run(q: string, tag: string, author: string) {
    // replaceState keeps the query out of history so Back doesn't step through
    // every keystroke; keepFocus leaves the field active as results stream in.
    goto(buildUrl(q, tag, author), {
      keepFocus: true,
      replaceState: true,
    });
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    run(query.trim(), tagFilter.trim(), authorFilter.trim());
  }

  $effect(() => {
    const q = query.trim();
    const t = tagFilter.trim();
    const a = authorFilter.trim();
    const curQ = data.query ?? "";
    const curT = (data as { tag?: string }).tag ?? "";
    const curA = (data as { author?: string }).author ?? "";
    if (q === curQ && t === curT && a === curA) return; // already showing this state
    const timeout = setTimeout(() => run(q, t, a), 250);
    return () => clearTimeout(timeout);
  });
</script>

<PageTitle text={data.query ? `Search · ${data.query}` : "Search"} />

<!-- Mobile-only search field (nav pill is hidden below `sm`). Autofocuses on
     the empty state so tapping search in the nav lands ready to type. -->
<form onsubmit={submit} role="search" class="mb-6 sm:hidden">
  <div class="flex h-11 items-center gap-2.5 rounded-full bg-muted/60 px-4 transition-colors focus-within:bg-muted">
    <Icon name="search" size={18} class="shrink-0 text-muted-foreground" />
    <!-- svelte-ignore a11y_autofocus -->
    <input
      data-search-input="q"
      bind:value={query}
      type="search"
      placeholder="Search"
      aria-label="Search articles and people"
      autofocus={!data.query}
      class="w-full bg-transparent text-[15px] outline-hidden placeholder:text-muted-foreground"
    />
  </div>
</form>

{#if !data.query}
  <div class="py-20 text-center">
    <Icon name="search" size={32} class="mx-auto text-muted-foreground" />
    <p class="mt-3 text-sm text-muted-foreground">Search articles and people across the fediverse.</p>
    <p class="mt-1 text-xs text-muted-foreground">
      Tip: press <kbd class="rounded-5px border border-border bg-muted px-1 py-0.5">/</kbd> to search anywhere, filter by
      tag or author on the results page.
    </p>
  </div>
{:else}
  <header class="mb-4">
    <h1 class="text-2xl font-bold tracking-tight text-foreground">
      Results for <span class="italic">“{data.query}”</span>
    </h1>
    {#if (data as { tag?: string }).tag || (data as { author?: string }).author}
      <p class="mt-1 text-sm text-muted-foreground">
        Filtered
        {#if (data as { tag?: string }).tag}
          by tag <span class="font-medium text-foreground">#{(data as { tag?: string }).tag}</span>
        {/if}
        {#if (data as { tag?: string }).tag && (data as { author?: string }).author}
          <span class="opacity-60"> · </span>
        {/if}
        {#if (data as { author?: string }).author}
          by author <span class="font-medium text-foreground">{(data as { author?: string }).author}</span>
        {/if}
      </p>
    {/if}
  </header>

  <!-- Tag & author filters — narrow only the Articles results. Debounced like the query
       so typing a filter re-runs search without a page reload. Theme tokens only. -->
  <form onsubmit={submit} class="mb-4 flex flex-col gap-3 sm:flex-row" role="search" aria-label="Filter articles">
    <label class="flex flex-1 flex-col gap-1.5">
      <span class="text-xs font-medium text-foreground">Tag</span>
      <div
        class="flex h-9 items-center gap-2 rounded-input border border-border bg-background px-3 focus-within:border-foreground/20 focus-within:ring-1 focus-within:ring-foreground/10"
      >
        <Icon name="tag" size={14} class="shrink-0 text-muted-foreground" />
        <input
          data-search-input="tag"
          bind:value={tagFilter}
          type="search"
          placeholder="e.g. technology"
          aria-label="Filter articles by tag"
          class="w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
        {#if tagFilter}
          <button
            type="button"
            onclick={() => (tagFilter = "")}
            class="shrink-0 rounded-5px p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear tag filter"
          >
            <Icon name="close" size={14} />
          </button>
        {/if}
      </div>
    </label>
    <label class="flex flex-1 flex-col gap-1.5">
      <span class="text-xs font-medium text-foreground">Author</span>
      <div
        class="flex h-9 items-center gap-2 rounded-input border border-border bg-background px-3 focus-within:border-foreground/20 focus-within:ring-1 focus-within:ring-foreground/10"
      >
        <Icon name="user" size={14} class="shrink-0 text-muted-foreground" />
        <input
          data-search-input="author"
          bind:value={authorFilter}
          type="search"
          placeholder="username or name"
          aria-label="Filter articles by author"
          class="w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
        {#if authorFilter}
          <button
            type="button"
            onclick={() => (authorFilter = "")}
            class="shrink-0 rounded-5px p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear author filter"
          >
            <Icon name="close" size={14} />
          </button>
        {/if}
      </div>
    </label>
  </form>

  {#if tagFilter.trim() || authorFilter.trim()}
    <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span class="text-muted-foreground">Active filters:</span>
      {#if tagFilter.trim()}
        <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
          <Icon name="tag" size={12} /> #{tagFilter.trim()}
          <button
            type="button"
            onclick={() => (tagFilter = "")}
            class="ml-1 rounded-full p-0.5 hover:bg-background"
            aria-label="Remove tag filter"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      {/if}
      {#if authorFilter.trim()}
        <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
          <Icon name="user" size={12} />
          {authorFilter.trim()}
          <button
            type="button"
            onclick={() => (authorFilter = "")}
            class="ml-1 rounded-full p-0.5 hover:bg-background"
            aria-label="Remove author filter"
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      {/if}
      <button
        type="button"
        onclick={() => {
          tagFilter = "";
          authorFilter = "";
        }}
        class="text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-2"
      >
        Clear all
      </button>
    </div>
  {/if}

  {#key `${data.query}-${(data as { tag?: string }).tag ?? ""}-${(data as { author?: string }).author ?? ""}`}
    <Tabs.Root value={defaultTab} class="w-full">
      <Tabs.List class="mb-2 flex items-center gap-6 text-sm font-medium">
        <Tabs.Trigger
          value="articles"
          class="-mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3 text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
        >
          <Icon name="read" size={16} /> Articles
          <span class="text-xs text-muted-foreground">{posts.length}</span>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="tags"
          class="-mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3 text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
        >
          <Icon name="tag" size={16} /> Tags
          <span class="text-xs text-muted-foreground">{tags.length}</span>
        </Tabs.Trigger>
        <Tabs.Trigger
          value="people"
          class="-mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3 text-muted-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground"
        >
          <Icon name="user" size={16} /> People
          <span class="text-xs text-muted-foreground">{people.length}</span>
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="articles" class="pt-3">
        {#if posts.length === 0}
          <p class="py-10 text-center text-muted-foreground">
            No articles match “{data.query}”{#if (data as { tag?: string }).tag}
              with tag
              <span class="font-medium">#{(data as { tag?: string }).tag}</span
              >{/if}{#if (data as { author?: string }).author}
              by
              <span class="font-medium">{(data as { author?: string }).author}</span>{/if}.
            {#if (data as { tag?: string }).tag || (data as { author?: string }).author}
              <button
                type="button"
                onclick={() => {
                  tagFilter = "";
                  authorFilter = "";
                }}
                class="ml-1 font-medium text-foreground underline underline-offset-2">Clear filters</button
              >
            {/if}
          </p>
        {:else}
          {#each posts as post (post.id)}
            <PostCard {post} />
          {/each}
        {/if}
      </Tabs.Content>

      <Tabs.Content value="tags" class="pt-3">
        {#if tags.length === 0}
          <p class="py-10 text-center text-muted-foreground">No tags match “{data.query}”.</p>
        {:else}
          <ul class="divide-y divide-border">
            {#each tags as tag (tag.slug)}
              <li>
                <a
                  href={`/tags/${tag.slug}`}
                  class="-mx-3 flex min-w-0 items-center gap-3 rounded-card px-3 py-3 transition-colors hover:bg-muted"
                >
                  <span
                    class="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-alt"
                  >
                    <Icon name="tag" size={20} />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-foreground">
                      #{tag.name}
                    </span>
                    <span class="block truncate text-xs text-muted-foreground">
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
          <p class="py-10 text-center text-muted-foreground">No people match “{data.query}”.</p>
        {:else}
          <ul class="divide-y divide-border">
            {#each people as person (person.id)}
              <li>
                <a
                  href={`/@${person.username}`}
                  class="-mx-3 flex min-w-0 items-center gap-3 rounded-card px-3 py-3 transition-colors hover:bg-muted"
                >
                  <Avatar name={person.displayName} src={person.avatarUrl ?? undefined} size={44} />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-foreground">
                      {person.displayName}
                    </span>
                    <span class="block truncate text-xs text-muted-foreground">
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
