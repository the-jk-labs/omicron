<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import { Tabs, Separator } from "bits-ui";
  import { endpoints } from "$lib/api";
  import PostCard from "$lib/components/PostCard.svelte";
  import ReadingListCard from "$lib/components/ReadingListCard.svelte";
  import ProfileLinksCard from "$lib/components/ProfileLinksCard.svelte";
  import ProfileLinkIcon from "$lib/components/ProfileLinkIcon.svelte";
  import { platformMeta } from "$lib/profileLinks";
  import FollowButton from "$lib/components/FollowButton.svelte";
  import ProfileMenu from "$lib/components/ProfileMenu.svelte";
  import FollowListDialog from "$lib/components/FollowListDialog.svelte";
  import TagList from "$lib/components/TagList.svelte";
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
  const isAdmin = $derived(!data.remote && "isAdmin" in profile.user && profile.user.isAdmin);
  // Public reading lists (local profiles only); the owner also sees their private ones.
  const lists = $derived(!data.remote ? data.lists : []);

  let posts = $state<Post[]>(data.page.items);
  let cursor = $state<string | null>(data.page.nextCursor);
  let loading = $state(false);

  // The full fediverse address (@user@host). Remote handles already carry the
  // host; for local users the host is the instance we're being served from, so
  // we read it from the browser once mounted (unknown during SSR).
  let host = $state("");
  onMount(() => (host = location.host));
  const fediHandle = $derived(
    data.remote
      ? `@${profile.user.username}`
      : host
        ? `@${profile.user.username}@${host}`
        : `@${profile.user.username}`,
  );

  let copied = $state(false);
  async function copyHandle() {
    try {
      await navigator.clipboard.writeText(fediHandle);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard unavailable (insecure context); silently ignore.
    }
  }

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

<!-- Responsive grid. Mobile (app-style): avatar + action on the top row, identity
     stacked full-width below. Desktop (sm+): the original three-column row —
     avatar · identity · action. -->
<header
  class="mb-8 grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-4 pb-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-y-0"
>
  <div class="col-start-1 row-start-1 self-center sm:self-start">
    <Avatar name={profile.user.displayName} src={profile.user.avatarUrl ?? undefined} size={72} />
  </div>

  {#if data.remote}
    {#if data.user}
      <div
        class="col-start-2 row-start-1 flex shrink-0 items-center gap-2 justify-self-end self-center sm:col-start-3"
      >
        <FollowButton
          username={data.profile.user.username}
          following={data.profile.isFollowing}
          remote
        />
        <ProfileMenu
          username={data.profile.user.username}
          muted={data.profile.isMuted}
          blocked={data.profile.isBlocked}
          remote
        />
      </div>
    {/if}
  {:else}
    <div
      class="col-start-2 row-start-1 flex shrink-0 items-center gap-2 justify-self-end self-center sm:col-start-3"
    >
      {#if isSelf}
        <Button href="/settings" variant="outline" size="sm">
          <Icon name="edit" size={15} /> Edit profile
        </Button>
      {:else if data.user}
        <FollowButton username={data.profile.user.username} following={data.profile.isFollowing} />
        <ProfileMenu
          username={data.profile.user.username}
          muted={data.profile.isMuted}
          blocked={data.profile.isBlocked}
        />
      {/if}
    </div>
  {/if}

  <!-- Identity block: name, handle, bio, stats. Spans both columns on mobile
       (its own row), middle column on desktop. -->
  <div class="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
    <h1 class="text-2xl font-bold tracking-tight text-foreground">{profile.user.displayName}</h1>
    <div class="flex flex-wrap items-center gap-2">
      <!-- Remote usernames are `user@host`; drop the host here since the
           instance badge beside it already shows it (no duplication). -->
      <p class="truncate text-muted-foreground">@{profile.user.username.split("@")[0]}</p>
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
    {#if profile.user.links?.length}
      <!-- Compact icon-only links; the About tab carries the labelled detail. -->
      <div class="mt-3 flex flex-wrap items-center gap-0.5">
        {#each profile.user.links as link (link.platform + link.url)}
          {@const meta = platformMeta(link.platform)}
          <a
            href={link.url}
            target="_blank"
            rel="me noopener noreferrer"
            title={link.label || meta.label}
            aria-label={link.label || meta.label}
            class="inline-flex size-7 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ProfileLinkIcon platform={link.platform} size={15} />
          </a>
        {/each}
      </div>
    {/if}
    {#if profile.user.tags?.length}
      <TagList tags={profile.user.tags} class="mt-3" />
    {/if}
    <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {#if data.remote}
        <span class="flex items-center gap-1">
          <Icon name="users" size={15} />
          <strong class="text-foreground">{profile.counts.followers}</strong> followers
        </span>
        <span>
          <strong class="text-foreground">{profile.counts.following}</strong> following
        </span>
      {:else}
        <FollowListDialog
          username={profile.user.username}
          kind="followers"
          title="Followers"
        >
          <span class="flex items-center gap-1">
            <Icon name="users" size={15} />
            <strong class="text-foreground">{profile.counts.followers}</strong> followers
          </span>
        </FollowListDialog>
        <FollowListDialog
          username={profile.user.username}
          kind="following"
          title="Following"
        >
          <span><strong class="text-foreground">{profile.counts.following}</strong> following</span>
        </FollowListDialog>
      {/if}
    </div>
  </div>
</header>

<Tabs.Root value="stories" class="w-full">
  <Tabs.List class="mb-2 flex items-center gap-6 text-sm font-medium">
    <Tabs.Trigger
      value="stories"
      class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center border-b border-transparent py-3"
    >Stories</Tabs.Trigger>
    {#if !data.remote}
      <Tabs.Trigger
        value="lists"
        class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center border-b border-transparent py-3"
      >Lists</Tabs.Trigger>
    {/if}
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

  {#if !data.remote}
    <Tabs.Content value="lists" class="pt-3">
      {#if lists.length === 0}
        <p class="py-10 text-center text-muted-foreground">
          {isSelf ? "You haven't shared any lists yet." : "No public lists yet."}
        </p>
      {:else}
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each lists as list (list.id)}
            <ReadingListCard {list} />
          {/each}
        </div>
      {/if}
    </Tabs.Content>
  {/if}

  <Tabs.Content value="about" class="pt-3">
    {#if !data.remote && data.profile.user.links.length > 0}
      <div class="mb-3 max-w-prose">
        <ProfileLinksCard links={data.profile.user.links} />
      </div>
    {/if}

    <dl class="max-w-prose divide-y divide-border rounded-card border border-border bg-background-alt">
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <dt class="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="at" size={15} /> Fediverse address
        </dt>
        <dd class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm text-foreground">{fediHandle}</span>
          <button
            type="button"
            onclick={copyHandle}
            title="Copy address"
            aria-label="Copy fediverse address"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon name={copied ? "check" : "copy"} size={15} />
          </button>
        </dd>
      </div>

      {#if !data.remote}
        {#if data.profile.user.publicEmail}
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="mail" size={15} /> Email
            </dt>
            <dd class="min-w-0">
              <a
                href={`mailto:${data.profile.user.publicEmail}`}
                class="truncate text-sm text-foreground underline-offset-4 hover:underline"
              >{data.profile.user.publicEmail}</a>
            </dd>
          </div>
        {/if}

        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <dt class="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="calendar" size={15} /> Joined
          </dt>
          <dd class="text-sm text-foreground">{formatDate(data.profile.user.createdAt)}</dd>
        </div>

        {#if isAdmin}
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <dt class="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="admin" size={15} /> Role
            </dt>
            <dd>
              <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                <Icon name="admin" size={12} /> Admin
              </span>
            </dd>
          </div>
        {/if}
      {:else}
        <div class="flex items-center justify-between gap-3 px-4 py-3">
          <dt class="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="globe" size={15} /> Profile
          </dt>
          <dd class="min-w-0">
            <a
              href={data.profile.user.apId}
              target="_blank"
              rel="noreferrer"
              class="truncate text-sm text-foreground underline-offset-4 hover:underline"
            >View on {data.profile.user.host}</a>
          </dd>
        </div>
      {/if}
    </dl>

    {#if isSelf && !profile.user.bio}
      <div class="mt-3 max-w-prose">
        <Separator.Root class="bg-border my-3 h-px" />
        <p class="text-sm text-muted-foreground">
          Your profile has no bio yet — add one from Edit profile to tell people who you are.
        </p>
      </div>
    {/if}
  </Tabs.Content>
</Tabs.Root>