<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import { endpoints } from "$lib/api";
  import { postPath } from "$lib/links";
  import Icon from "$lib/components/Icon.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import FollowButton from "$lib/components/FollowButton.svelte";
  import type { Post, SuggestedUser, TagWithCount } from "$lib/types";

  // Discovery rail: what's worth reading and who's worth following right now.
  // Three independent lists (trending posts, who to follow, topics) fetched in
  // parallel on mount; each renders only when it has something to show, so the
  // rail never displays an empty section.
  const appName = env.PUBLIC_APP_NAME || "Omicron";
  const signedIn = $derived(!!page.data.user);

  let posts = $state<Post[]>([]);
  let people = $state<SuggestedUser[]>([]);
  let tags = $state<TagWithCount[]>([]);
  let loading = $state(true);

  onMount(async () => {
    const api = endpoints();
    // Each list is independent — a failure in one must not blank the others.
    const [p, u, t] = await Promise.allSettled([
      api.trendingPosts(),
      api.suggestedUsers(),
      api.trendingTags(),
    ]);
    if (p.status === "fulfilled") posts = p.value.items;
    if (u.status === "fulfilled") people = u.value.items;
    if (t.status === "fulfilled") tags = t.value.tags.slice(0, 8);
    loading = false;
  });
</script>

<aside class="flex flex-col gap-6 text-sm">
  {#if loading}
    <!-- Skeleton while the three lists load, sized to the trending list so the
         rail doesn't jump when content arrives. -->
    <div class="space-y-3">
      <div class="bg-muted h-4 w-24 rounded-9px"></div>
      {#each Array(3) as _}
        <div class="space-y-1.5">
          <div class="bg-muted h-3 w-full rounded-9px"></div>
          <div class="bg-muted h-3 w-2/3 rounded-9px"></div>
        </div>
      {/each}
    </div>
  {:else}
    {#if posts.length}
      <section>
        <h2 class="text-foreground mb-3 flex items-center gap-2 text-base font-semibold">
          <Icon name="trending" size={18} /> Trending
        </h2>
        <ol class="space-y-4">
          {#each posts as post, i (post.id)}
            <li class="flex gap-3">
              <span class="text-muted-foreground/60 w-4 shrink-0 text-base font-bold tabular-nums">
                {i + 1}
              </span>
              <div class="min-w-0">
                <a
                  href={`/@${post.author.username}`}
                  class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                >
                  <Avatar name={post.author.displayName} src={post.author.avatarUrl ?? undefined} size={18} />
                  <span class="truncate text-xs font-medium">{post.author.displayName}</span>
                </a>
                <a
                  href={postPath(post)}
                  class="text-foreground hover:text-foreground-alt mt-0.5 block font-semibold leading-snug line-clamp-2"
                >
                  {post.title ?? "Untitled"}
                </a>
                <div class="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                  <span class="flex items-center gap-1"><Icon name="heart" size={12} /> {post.likeCount}</span>
                  <span class="flex items-center gap-1"><Icon name="comment" size={12} /> {post.commentCount}</span>
                </div>
              </div>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if people.length}
      <section>
        <h2 class="text-foreground mb-3 flex items-center gap-2 text-base font-semibold">
          <Icon name="users" size={18} /> Who to follow
        </h2>
        <ul class="space-y-3">
          {#each people as person (person.id)}
            <li class="flex items-center gap-2.5">
              <a href={`/@${person.username}`} class="flex min-w-0 items-center gap-2.5 hover:opacity-80">
                <Avatar name={person.displayName} src={person.avatarUrl ?? undefined} size={36} />
                <span class="min-w-0">
                  <span class="text-foreground block truncate font-semibold">{person.displayName}</span>
                  <span class="text-muted-foreground block truncate text-xs">
                    {person.followerCount} {person.followerCount === 1 ? "follower" : "followers"}
                  </span>
                </span>
              </a>
              {#if signedIn}
                <span class="ml-auto shrink-0">
                  <FollowButton username={person.username} following={false} size="xs" />
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if tags.length}
      <section>
        <h2 class="text-foreground mb-3 flex items-center gap-2 text-base font-semibold">
          <Icon name="tag" size={18} /> Topics
        </h2>
        <div class="flex flex-wrap gap-2">
          {#each tags as tag (tag.slug)}
            <Button
              href={`/tags/${tag.slug}`}
              variant="outline"
              size="xs"
              class="rounded-full !font-medium"
            >
              <Icon name="tag" size={13} /> {tag.name}
              <span class="text-muted-foreground">{tag.postCount}</span>
            </Button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  <p class="text-muted-foreground border-border border-t pt-4 text-xs">
    © {new Date().getFullYear()} {appName} · Federated blogging
  </p>
</aside>
