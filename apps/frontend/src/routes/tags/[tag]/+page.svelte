<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { untrack } from "svelte";
  import { endpoints } from "#lib/api/index.js";
  import LoadMoreButton from "#lib/components/LoadMoreButton.svelte";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import PostCard from "#lib/components/PostCard.svelte";
  import TagFollowButton from "#lib/components/TagFollowButton.svelte";
  import type { Post } from "#lib/types.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const tag = $derived(data.detail.tag);

  let posts = $state<Post[]>(untrack(() => data.page.items));
  let cursor = $state<string | null>(untrack(() => data.page.nextCursor));
  let loading = $state(false);
  // Reset when navigating between tag pages client-side; "load more" appends to
  // `posts` without changing `data`, so it isn't undone.
  $effect(() => {
    posts = data.page.items;
    cursor = data.page.nextCursor;
  });

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

<PageTitle text={`#${tag.name}`} />

<header class="mb-8 flex items-start justify-between gap-4 pb-2">
  <div class="min-w-0">
    <h1 class="text-2xl font-bold tracking-tight text-foreground">#{tag.name}</h1>
    <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>
        <strong class="text-foreground">{data.detail.postCount}</strong>
        {data.detail.postCount === 1 ? "article" : "articles"}
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
  <p class="py-16 text-center text-muted-foreground">No articles tagged #{tag.name} yet.</p>
{:else}
  {#each posts as post, i (post.id)}
    <PostCard {post} eager={i < 3} />
  {/each}
  {#if cursor}
    <LoadMoreButton load={loadMore} {loading} />
  {/if}
{/if}
