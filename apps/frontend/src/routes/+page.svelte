<script lang="ts">
  import { Tabs } from "bits-ui";
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { Page, Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // Each feed is an independent paginated list. For signed-in users the server
  // pre-loads "For you"; "Latest" loads lazily the first time its tab opens.
  type Feed = {
    items: Post[];
    cursor: string | null;
    loaded: boolean;
    loading: boolean;
    fetch: (c?: string | null) => Promise<Page<Post>>;
  };

  const api = endpoints();

  const forYou = $state<Feed>({
    items: data.page.items,
    cursor: data.page.nextCursor,
    loaded: true,
    loading: false,
    fetch: api.feed,
  });

  const latest = $state<Feed>({
    items: data.personalized ? [] : data.page.items,
    cursor: data.personalized ? null : data.page.nextCursor,
    loaded: !data.personalized,
    loading: false,
    fetch: api.globalTimeline,
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

  async function ensureLoaded(feed: Feed) {
    if (feed.loaded || feed.loading) return;
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

  function onTabChange(value: string) {
    if (value === "latest") ensureLoaded(latest);
  }
</script>

<svelte:head><title>Omicron — Human stories &amp; ideas</title></svelte:head>

{#if !data.personalized}
  <!-- Logged-out hero, Medium style. -->
  <section class="mb-10 border-b border-border pb-10">
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

{#snippet feedView(feed: Feed, empty: string)}
  {#if feed.loading && feed.items.length === 0}
    <p class="py-8 text-center text-muted-foreground">Loading…</p>
  {:else if feed.items.length === 0}
    <div class="py-10 text-center text-muted-foreground">
      <p>{empty}</p>
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

{#if data.personalized}
  <Tabs.Root value="for-you" onValueChange={onTabChange} class="rounded-card border-muted bg-background-alt shadow-card mb-4 w-full border p-3">
    <Tabs.List class="rounded-9px bg-dark-10 shadow-mini-inset dark:bg-background dark:border dark:border-border grid w-full grid-cols-2 gap-1 p-1 text-sm font-semibold leading-[0.01em]">
      <Tabs.Trigger
        value="for-you"
        class="data-[state=active]:shadow-mini inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] bg-transparent py-2 data-[state=active]:bg-background dark:data-[state=active]:bg-muted"
      >
        <Icon name="sparkles" size={16} /> For you
      </Tabs.Trigger>
      <Tabs.Trigger
        value="latest"
        class="data-[state=active]:shadow-mini inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] bg-transparent py-2 data-[state=active]:bg-background dark:data-[state=active]:bg-muted"
      >
        <Icon name="globe" size={16} /> Latest
      </Tabs.Trigger>
    </Tabs.List>
    <Tabs.Content value="for-you" class="select-none pt-3">
      {@render feedView(forYou, "Your feed is empty — follow some writers to fill it.")}
    </Tabs.Content>
    <Tabs.Content value="latest" class="select-none pt-3">
      {@render feedView(latest, "No stories on this instance yet.")}
    </Tabs.Content>
  </Tabs.Root>
{:else}
  <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Latest stories</h2>
  {@render feedView(latest, "No stories on this instance yet.")}
{/if}
