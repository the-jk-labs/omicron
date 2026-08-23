<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import FollowButton from "$lib/components/FollowButton.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import ReactionCount from "$lib/components/ReactionCount.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { postPath } from "$lib/links";
  import type { Post, SuggestedUser, TagWithCount } from "$lib/types";

  // Discovery rail: what's worth reading and who's worth following right now.
  // The three lists (trending posts, who to follow, topics) are fetched
  // server-side in +layout.server.ts and passed in here, so the rail is present
  // in the initial SSR HTML rather than popping in after client hydration. Each
  // section renders only when it has something to show.
  type Discover = { posts: Post[]; people: SuggestedUser[]; tags: TagWithCount[] };
  let { data = null }: { data?: Discover | null } = $props();
  const signedIn = $derived(!!page.data.user);

  const posts = $derived(data?.posts ?? []);
  const people = $derived(data?.people ?? []);
  const tags = $derived(data?.tags ?? []);
</script>

<aside class="flex flex-col gap-6 text-sm">
  {#if posts.length}
    <section>
      <h2 class="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <Icon name="trending" size={18} /> Trending
        <span
          class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          title="Ranking: likes×1 + comments×2, then divided by (hours+2)^1.5 for recency decay — author's own likes/comments excluded"
          >Last 7 days</span
        >
      </h2>
      <p class="-mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        Ranking: <span class="font-medium text-foreground">likes×1 + comments×2</span> ÷ (hours+2)<sup>1.5</sup> — author's
        own votes excluded, older posts decay gradually.
      </p>
      <ol class="space-y-4">
        {#each posts as post, i (post.id)}
          <li class="flex gap-3">
            <span class="w-4 shrink-0 text-base font-bold text-muted-foreground/60 tabular-nums">
              {i + 1}
            </span>
            <div class="min-w-0">
              <a
                href={`/@${post.author.username}`}
                class="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Avatar
                  name={post.author.displayName}
                  src={post.author.avatarUrl ?? undefined}
                  size={18}
                  class="shrink-0"
                />
                <span class="truncate text-xs font-medium" title={post.author.displayName}
                  >{post.author.displayName}</span
                >
              </a>
              <a
                href={postPath(post)}
                class="mt-0.5 line-clamp-2 block leading-snug font-semibold text-foreground hover:text-foreground-alt"
              >
                {post.title ?? "Untitled"}
              </a>
              <div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <ReactionCount icon="heart" count={post.likeCount} singular="like" size={12} />
                <ReactionCount icon="comment" count={post.commentCount} singular="response" size={12} />
                <ReactionCount icon="recommend" count={post.recommendCount} singular="recommendation" size={12} />
              </div>
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#if people.length}
    <section>
      <h2 class="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <Icon name="users" size={18} /> Who to follow
      </h2>
      <ul class="space-y-3">
        {#each people as person (person.id)}
          <li class="flex items-center gap-2.5">
            <a href={`/@${person.username}`} class="flex min-w-0 items-center gap-2.5 hover:opacity-80">
              <Avatar name={person.displayName} src={person.avatarUrl ?? undefined} size={36} />
              <span class="min-w-0">
                <span class="block truncate font-semibold text-foreground" title={person.displayName}
                  >{person.displayName}</span
                >
                <span class="block truncate text-xs text-muted-foreground">
                  {person.followerCount}
                  {person.followerCount === 1 ? "follower" : "followers"}
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
      <h2 class="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
        <Icon name="tag" size={18} /> Topics
        <span
          class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          title="Most used tags in the last 7 days — counts are posts in that window">Last 7 days</span
        >
      </h2>
      <p class="-mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        Most used in the last 7 days — counts are posts in that window.
      </p>
      <div class="flex flex-wrap gap-2">
        {#each tags as tag (tag.slug)}
          <Button
            href={`/tags/${tag.slug}`}
            variant="outline"
            size="xs"
            class="rounded-full font-medium!"
            title={`${tag.postCount} posts in the last 7 days`}
          >
            <Icon name="tag" size={13} />
            {tag.name}
            <span class="text-muted-foreground">{tag.postCount}</span>
            <span class="sr-only">posts in the last 7 days</span>
          </Button>
        {/each}
      </div>
    </section>
  {/if}
</aside>
