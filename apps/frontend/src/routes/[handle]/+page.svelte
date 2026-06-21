<script lang="ts">
  import { Tabs } from "bits-ui";
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import FollowButton from "$lib/components/FollowButton.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const profile = $derived(data.profile);
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

<header class="mb-8 flex items-start justify-between gap-4 border-b border-border pb-8">
  <div class="flex items-start gap-4">
    <Avatar name={profile.user.displayName} size={72} />
    <div>
      <h1 class="text-2xl font-bold tracking-tight text-foreground">{profile.user.displayName}</h1>
      <p class="text-muted-foreground">@{profile.user.username}</p>
      {#if profile.user.bio}<p class="mt-2 max-w-prose text-foreground-alt">{profile.user.bio}</p>{/if}
      <div class="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
        <span class="flex items-center gap-1">
          <Icon name="users" size={15} />
          <strong class="text-foreground">{profile.counts.followers}</strong> followers
        </span>
        <span>
          <strong class="text-foreground">{profile.counts.following}</strong> following
        </span>
      </div>
    </div>
  </div>
  {#if data.user && !isSelf}
    <FollowButton username={profile.user.username} following={profile.isFollowing} />
  {/if}
</header>

<Tabs.Root value="stories" class="rounded-card border-muted bg-background-alt shadow-card mb-4 w-full border p-3">
  <Tabs.List class="rounded-9px bg-dark-10 shadow-mini-inset dark:bg-background dark:border dark:border-border grid w-full grid-cols-2 gap-1 p-1 text-sm font-semibold leading-[0.01em]">
    <Tabs.Trigger
      value="stories"
      class="data-[state=active]:shadow-mini inline-flex h-8 items-center justify-center rounded-[7px] bg-transparent py-2 data-[state=active]:bg-background dark:data-[state=active]:bg-muted"
    >Stories</Tabs.Trigger>
    <Tabs.Trigger
      value="about"
      class="data-[state=active]:shadow-mini inline-flex h-8 items-center justify-center rounded-[7px] bg-transparent py-2 data-[state=active]:bg-background dark:data-[state=active]:bg-muted"
    >About</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content value="stories" class="select-none pt-3">
    {#if posts.length === 0}
      <p class="py-10 text-center text-muted-foreground">No stories yet.</p>
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
  </Tabs.Content>

  <Tabs.Content value="about" class="select-none px-1 pt-3 text-foreground-alt">
    {#if profile.user.bio}
      <p class="max-w-prose">{profile.user.bio}</p>
    {:else}
      <p class="text-muted-foreground">No bio yet.</p>
    {/if}
    <p class="mt-4 text-sm text-muted-foreground">Joined {formatDate(profile.user.createdAt)}</p>
  </Tabs.Content>
</Tabs.Root>
