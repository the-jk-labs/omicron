<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { excerpt, formatDate, readTime } from "$lib/format";
  import { postPath } from "$lib/links";
  import type { Post } from "$lib/types";

  let { post }: { post: Post } = $props();

  const summary = $derived(excerpt(post.contentHtml));
  const minutes = $derived(readTime(post.contentHtml));
</script>

<article class="border-b border-border py-7">
  <div class="mb-3 flex items-center gap-2 text-sm text-foreground-alt">
    <Button href={`/@${post.author.username}`} variant="plain" class="flex items-center gap-2 hover:opacity-80">
      <Avatar name={post.author.displayName} src={post.author.avatarUrl ?? undefined} size={24} />
      <span class="font-medium text-foreground">{post.author.displayName}</span>
    </Button>
  </div>

  <Button href={postPath(post)} variant="plain" class="group block w-full text-left">
    {#if post.title}
      <h2 class="text-xl font-bold leading-snug text-foreground group-hover:text-foreground-alt sm:text-2xl">
        {post.title}
      </h2>
    {/if}
    {#if summary}
      <p class="mt-1.5 line-clamp-3 text-muted-foreground">{summary}</p>
    {/if}
  </Button>

  <div class="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
    <span>{formatDate(post.createdAt)}</span>
    <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
    <span class="flex items-center gap-1"><Icon name="heart" size={13} /> {post.likeCount}</span>
    <span class="flex items-center gap-1"><Icon name="comment" size={13} /> {post.commentCount}</span>
    {#if post.remote}
      <span class="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        <Icon name="globe" size={12} /> Federated
      </span>
    {/if}
  </div>
</article>