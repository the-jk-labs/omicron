<script lang="ts">
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let posts = $state<Post[]>(data.page.items);
  let cursor = $state<string | null>(data.page.nextCursor);
  let loading = $state(false);

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const api = endpoints();
      const next = data.personalized
        ? await api.feed(cursor)
        : await api.globalTimeline(cursor);
      posts = [...posts, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Omicron</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold tracking-tight text-neutral-900">
  {data.personalized ? "Your feed" : "Latest stories"}
</h1>

{#if posts.length === 0}
  <p class="text-neutral-500">
    No posts yet. {data.personalized ? "Follow some writers or" : ""}
    <Button href="/compose" variant="ghost" class="!px-0 underline">write the first story</Button>.
  </p>
{:else}
  {#each posts as post (post.id)}
    <PostCard {post} />
  {/each}
{/if}

{#if cursor}
  <div class="mt-6 flex justify-center">
    <Button onclick={loadMore} disabled={loading} variant="outline">
      {loading ? "Loading…" : "Load more"}
    </Button>
  </div>
{/if}
