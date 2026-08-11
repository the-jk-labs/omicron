<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import SaveToListButton from "$lib/components/SaveToListButton.svelte";
  import TagList from "$lib/components/TagList.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { excerpt, formatDateTime, readTime } from "$lib/format";
  import { postPath } from "$lib/links";
  import { timeZone } from "$lib/timezone";
  import type { Post } from "$lib/types";

  let { post }: { post: Post } = $props();

  const signedIn = $derived(!!page.data.user);
  // An ingested post carries its own preview (the CMS's `description`); anything
  // written in the editor has none, so fall back to clipping the body.
  const summary = $derived(post.summary?.trim() || excerpt(post.contentHtml));
  const minutes = $derived(readTime(post.contentHtml));

  // The banner may be a URL on someone else's host, so a dead link is an
  // ordinary outcome rather than a bug. Drop the image on error instead of leaving a
  // broken-image glyph in the card.
  let coverFailed = $state(false);
  $effect(() => {
    void post.bannerUrl;
    coverFailed = false;
  });
  // Remote authors carry a `user@host` handle; surface the origin instance
  // (the host) rather than a generic "Federated" label.
  const originInstance = $derived(post.author.username.split("@")[1] ?? null);
</script>

<article class="py-5">
  <div class="mb-3 flex items-center gap-2 text-sm text-foreground-alt">
    <Button href={`/@${post.author.username}`} variant="plain" class="flex min-w-0 items-center gap-2 hover:opacity-80">
      <Avatar name={post.author.displayName} src={post.author.avatarUrl ?? undefined} size={24} />
      <span class="truncate font-medium text-foreground">{post.author.displayName}</span>
    </Button>
    {#if post.remote && originInstance}
      <span class="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
        <Icon name="globe" size={12} />
        {originInstance}
      </span>
    {/if}
  </div>

  <Button href={postPath(post)} variant="plain" class="group block w-full text-left">
    <div class="flex items-start gap-4">
      <div class="min-w-0 flex-1">
        {#if post.title}
          <h2 class="text-xl font-bold leading-snug text-foreground group-hover:text-foreground-alt sm:text-2xl">
            {post.title}
          </h2>
        {/if}
        {#if summary}
          <p class="mt-1.5 line-clamp-3 text-muted-foreground">{summary}</p>
        {/if}
      </div>
      {#if post.bannerUrl && !coverFailed}
        <!-- Decorative: the title beside it already names the post. -->
        <!-- The CSS box is already fixed, so this thumbnail cannot shift the
             layout; `width`/`height` are set anyway so the space is reserved
             even before the stylesheet applies. `decoding="async"` keeps a
             long feed of these off the main thread. -->
        <img
          src={post.bannerUrl}
          alt=""
          width="144"
          height="96"
          loading="lazy"
          decoding="async"
          onerror={() => (coverFailed = true)}
          class="mt-1 h-20 w-28 shrink-0 rounded-card border border-border object-cover sm:h-24 sm:w-36"
        />
      {/if}
    </div>
  </Button>

  {#if post.tags?.length}
    <TagList tags={post.tags} class="mt-3" />
  {/if}

  <div class="mt-4 flex items-center gap-3">
    <div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span>{formatDateTime(post.createdAt, $timeZone)}</span>
      <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
      <span class="flex items-center gap-1"><Icon name="heart" size={13} /> {post.likeCount}</span>
      <span class="flex items-center gap-1"><Icon name="comment" size={13} /> {post.commentCount}</span>
    </div>
    <span class="ml-auto shrink-0"><SaveToListButton postId={post.id} {signedIn} /></span>
  </div>
</article>
