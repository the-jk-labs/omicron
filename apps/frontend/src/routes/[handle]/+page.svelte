<script lang="ts">
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import FollowButton from "$lib/components/FollowButton.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const profile = $derived(data.profile);
  // Is the viewer looking at their own profile?
  const isSelf = $derived(data.user?.id === profile.user.id);

  let posts = $state<Post[]>(data.page.items);
  let cursor = $state<string | null>(data.page.nextCursor);
  let loading = $state(false);

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const next = await endpoints().userPosts(profile.user.username, cursor);
      posts = [...posts, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>{profile.user.displayName} · Omicron</title></svelte:head>

<header class="mb-8 flex items-start justify-between border-b border-neutral-200 pb-6">
  <div>
    <h1 class="text-2xl font-bold tracking-tight text-neutral-900">{profile.user.displayName}</h1>
    <p class="text-neutral-500">@{profile.user.username}</p>
    {#if profile.user.bio}<p class="mt-2 text-neutral-700">{profile.user.bio}</p>{/if}
    <p class="mt-3 text-sm text-neutral-500">
      <strong class="text-neutral-900">{profile.counts.followers}</strong> followers ·
      <strong class="text-neutral-900">{profile.counts.following}</strong> following
    </p>
  </div>
  {#if data.user && !isSelf}
    <FollowButton username={profile.user.username} following={profile.isFollowing} />
  {/if}
</header>

{#if posts.length === 0}
  <p class="text-neutral-500">No posts yet.</p>
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
