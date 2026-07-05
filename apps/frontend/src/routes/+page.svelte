<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { Tabs } from "bits-ui";
  import { endpoints } from "$lib/api";
  import { reading } from "$lib/prefs.svelte";
  import PostCard from "$lib/components/PostCard.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { Page, Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Each tab is an independent paginated list. The server pre-loads the default
  // tab ("For you" when signed in, otherwise "Global"); the others load lazily
  // the first time they are opened.
  type Feed = {
    value: string;
    label: string;
    icon: IconName;
    empty: string;
    items: Post[];
    cursor: string | null;
    loaded: boolean;
    loading: boolean;
    fetch: (c?: string | null) => Promise<Page<Post>>;
  };

  const api = endpoints();

  // The feed set and its preloaded payload are fixed for the life of this
  // component instance (a change in sign-in state triggers a full reload), so
  // read the loaded data once when building them.
  const personalized = untrack(() => data.personalized);
  const preload = untrack(() => data.page);

  function makeFeed(
    init: Pick<Feed, "value" | "label" | "icon" | "empty" | "fetch"> & { preload?: Page<Post> },
  ): Feed {
    return {
      ...init,
      items: init.preload?.items ?? [],
      cursor: init.preload?.nextCursor ?? null,
      loaded: !!init.preload,
      loading: false,
    };
  }

  // "For you" exists only when signed in; "Global" is the default for guests.
  const forYou = makeFeed({
    value: "for-you",
    label: "For you",
    icon: "sparkles",
    empty: "Your feed is empty — follow some writers to fill it.",
    fetch: api.feed,
    preload: personalized ? preload : undefined,
  });

  const local = makeFeed({
    value: "local",
    label: "Local",
    icon: "users",
    empty: "No stories on this instance yet.",
    fetch: api.localTimeline,
  });

  const global = makeFeed({
    value: "global",
    label: "Global",
    icon: "globe",
    empty: "No federated stories yet.",
    fetch: api.globalTimeline,
    preload: personalized ? undefined : preload,
  });

  const feeds = $state<Feed[]>(
    personalized ? [forYou, local, global] : [global, local],
  );
  const defaultTab = personalized ? "for-you" : "global";

  // Controlled active tab. SSR and the first client render both use `defaultTab`
  // (the preloaded feed) so hydration matches; after mount we honour the user's
  // saved reading preference if it points at an available tab.
  let activeTab = $state(defaultTab);

  onMount(() => {
    const pref = reading.defaultFeed;
    if (pref && pref !== activeTab && feeds.some((f) => f.value === pref)) {
      activeTab = pref;
      ensureLoaded(pref);
    }
  });

  async function loadMore(feed: Feed) {
    if (feed.loading || !feed.cursor) return;
    feed.loading = true;
    try {
      const next = await feed.fetch(feed.cursor);
      feed.items = [...feed.items, ...next.items];
      feed.cursor = next.nextCursor;
    } finally {
      feed.loading = false;
    }
  }

  async function ensureLoaded(value: string) {
    const feed = feeds.find((f) => f.value === value);
    if (!feed || feed.loaded || feed.loading) return;
    feed.loading = true;
    try {
      const res = await feed.fetch();
      feed.items = res.items;
      feed.cursor = res.nextCursor;
      feed.loaded = true;
    } finally {
      feed.loading = false;
    }
  }
</script>

<svelte:head><title>Omicron</title></svelte:head>

{#if !data.personalized}
  <!-- Logged-out hero, Medium style. -->
  <section class="mb-10 pb-10">
    <h1 class="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
      Human stories &amp; ideas
    </h1>
    <p class="mt-3 max-w-prose text-lg text-muted-foreground">
      A place to read, write, and connect across the fediverse. Follow writers on any
      ActivityPub server and build your own feed.
    </p>
    <div class="mt-6 flex gap-2">
      <Button href="/register" variant="solid">Start writing</Button>
      <Button href="/login" variant="outline">Sign in</Button>
    </div>
  </section>
{/if}

{#snippet feedView(feed: Feed)}
  {#if feed.loading && feed.items.length === 0}
    <p class="py-8 text-center text-muted-foreground">Loading…</p>
  {:else if feed.items.length === 0}
    <div class="py-10 text-center text-muted-foreground">
      <p>{feed.empty}</p>
      <div class="mt-4 flex justify-center">
        <Button href="/compose" variant="outline"><Icon name="compose" size={16} /> Write a story</Button>
      </div>
    </div>
  {:else}
    {#each feed.items as post (post.id)}
      <PostCard {post} />
    {/each}
    {#if feed.cursor}
      <div class="mt-8 flex justify-center">
        <Button onclick={() => loadMore(feed)} disabled={feed.loading} variant="outline">
          {feed.loading ? "Loading…" : "Show more"}
        </Button>
      </div>
    {/if}
  {/if}
{/snippet}

<Tabs.Root bind:value={activeTab} onValueChange={ensureLoaded} class="w-full">
  <Tabs.List class="mb-2 flex items-center gap-6 text-sm font-medium">
    {#each feeds as feed (feed.value)}
      <Tabs.Trigger
        value={feed.value}
        class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
      >
        <Icon name={feed.icon} size={16} /> {feed.label}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
  {#each feeds as feed (feed.value)}
    <Tabs.Content value={feed.value} class="select-none pt-3">
      {@render feedView(feed)}
    </Tabs.Content>
  {/each}
</Tabs.Root>