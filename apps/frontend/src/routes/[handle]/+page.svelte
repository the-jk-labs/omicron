<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Tabs } from "bits-ui";
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import FollowButton from "$lib/components/FollowButton.svelte";
  import EditProfileDialog from "$lib/components/EditProfileDialog.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { Post } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const profile = $derived(data.profile);
  // Self/edit/follow only apply to local profiles; remote browsing is read-only.
  const isSelf = $derived(!data.remote && data.user?.id === profile.user.id);

  let posts = $state<Post[]>(data.page.items);
  let cursor = $state<string | null>(data.page.nextCursor);
  let loading = $state(false);

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const handle = profile.user.username;
      const next = data.remote
        ? await endpoints().remoteUserPosts(handle, cursor)
        : await endpoints().userPosts(handle, cursor);
      posts = [...posts, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>{profile.user.displayName} · Omicron</title></svelte:head>

<header class="mb-8 flex items-start justify-between gap-4 border-b border-border pb-8">
  <div class="flex min-w-0 items-start gap-4">
    <Avatar name={profile.user.displayName} src={profile.user.avatarUrl ?? undefined} size={72} />
    <div class="min-w-0">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">{profile.user.displayName}</h1>
      <div class="flex flex-wrap items-center gap-2">
        <p class="truncate text-muted-foreground">@{profile.user.username}</p>
        {#if data.remote}
          <a
            href={data.profile.user.apId}
            target="_blank"
            rel="noreferrer"
            title="View on {data.profile.user.host}"
            class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-dark-10 hover:text-foreground"
          >
            <Icon name="globe" size={12} /> {data.profile.user.host}
          </a>
        {/if}
      </div>
      {#if profile.user.bio}<p class="mt-2 max-w-prose whitespace-pre-line text-foreground-alt">{profile.user.bio}</p>{/if}
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
  {#if data.remote}
    {#if data.user}
      <div class="shrink-0 self-center">
        <FollowButton
          username={data.profile.user.username}
          following={data.profile.isFollowing}
          remote
        />
      </div>
    {/if}
  {:else}
    <div class="shrink-0 self-center">
      {#if isSelf}
        <EditProfileDialog user={data.profile.user} />
      {:else if data.user}
        <FollowButton username={data.profile.user.username} following={data.profile.isFollowing} />
      {/if}
    </div>
  {/if}
</header>

<Tabs.Root value="stories" class="w-full">
  <Tabs.List class="mb-2 flex items-center gap-6 border-b border-border text-sm font-medium">
    <Tabs.Trigger
      value="stories"
      class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center border-b border-transparent py-3"
    >Stories</Tabs.Trigger>
    <Tabs.Trigger
      value="about"
      class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center border-b border-transparent py-3"
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
      <p class="max-w-prose whitespace-pre-line">{profile.user.bio}</p>
    {:else}
      <p class="text-muted-foreground">No bio yet.</p>
    {/if}
    {#if !data.remote}
      <p class="mt-4 text-sm text-muted-foreground">Joined {formatDate(data.profile.user.createdAt)}</p>
    {/if}
  </Tabs.Content>
</Tabs.Root>