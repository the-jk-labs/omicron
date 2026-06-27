<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import TagFollowButton from "$lib/components/TagFollowButton.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const tag = $derived(data.detail.tag);

  let posts = $state<Post[]>(data.page.items);
  let cursor = $state<string | null>(data.page.nextCursor);
  let loading = $state(false);

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const next = await endpoints().tagPosts(tag.slug, cursor);
      posts = [...posts, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>#{tag.name} · Omicron</title></svelte:head>

<header class="mb-8 flex items-start justify-between gap-4 pb-2">
  <div class="min-w-0">
    <h1 class="flex items-center gap-1.5 text-2xl font-bold tracking-tight text-foreground">
      <Icon name="tag" size={22} class="text-muted-foreground" />#{tag.name}
    </h1>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>
        <strong class="text-foreground">{data.detail.postCount}</strong>
        {data.detail.postCount === 1 ? "story" : "stories"}
      </span>
      <span>
        <strong class="text-foreground">{data.detail.followerCount}</strong>
        {data.detail.followerCount === 1 ? "follower" : "followers"}
      </span>
    </div>
  </div>

  {#if data.user}
    <div class="shrink-0">
      <TagFollowButton slug={tag.slug} following={data.detail.isFollowing} />
    </div>
  {/if}
</header>

{#if posts.length === 0}
  <p class="py-16 text-center text-muted-foreground">No stories tagged #{tag.name} yet.</p>
{:else}
  {#each posts as post (post.id)}
    <PostCard {post} />
  {/each}
  {#if cursor}
    <div class="mt-8 flex justify-center">
      <Button onclick={loadMore} disabled={loading} variant="outline">
        {loading ? "Loading…" : "Show more"}
      </Button>
    </div>
  {/if}
{/if}
