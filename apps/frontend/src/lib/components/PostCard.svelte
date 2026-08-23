<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import Icon from "$lib/components/Icon.svelte";
  import ReactionCount from "$lib/components/ReactionCount.svelte";
  import RecommendButton from "$lib/components/RecommendButton.svelte";
  import SaveToListButton from "$lib/components/SaveToListButton.svelte";
  import TagList from "$lib/components/TagList.svelte";
  import Time from "$lib/components/Time.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { excerpt, readTime } from "$lib/format";
  import { postPath } from "$lib/links";
  import type { Post } from "$lib/types";

  let { post }: { post: Post } = $props();

  // The card's body is one big link over the title, the summary and the
  // thumbnail, so its accessible name was everything inside it concatenated:
  // "UNIX-programming-timev Historically, UNIX systems have maintained two
  // different time values for a file." Anyone pulling up a list of links, or
  // tabbing through a feed, heard the whole excerpt on every card before they
  // could tell one post from the next. Naming the link from the heading alone
  // fixes that and leaves the hit area, the markup and the styling untouched.
  //
  // Only when there is a title: an untitled post (a remote note, mostly) has no
  // heading to point at, and its summary is then the only thing that can name
  // the link — which is what happens without the attribute.
  const titleId = $props.id();

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

<article class="py-5" lang={post.language ?? undefined}>
  {#if post.recommendedBy}
    <!-- "For you" feed only: this post reached the viewer because someone they
         follow recommended it, not because of its own author/date — flag that
         above the byline, Twitter-repost-style, before anything else. -->
    <Button
      href={`/@${post.recommendedBy.username}`}
      variant="plain"
      class="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      <Icon name="recommend" size={14} />
      {post.recommendedBy.displayName} recommended this
    </Button>
  {/if}
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

  <Button
    href={postPath(post)}
    variant="plain"
    aria-labelledby={post.title ? titleId : undefined}
    hreflang={post.language ?? undefined}
    class="group block w-full text-left"
  >
    <div class="flex items-start gap-4">
      <div class="min-w-0 flex-1">
        {#if post.title}
          <h2
            id={titleId}
            class="text-xl leading-snug font-bold text-foreground group-hover:text-foreground-alt sm:text-2xl"
          >
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

  <!-- Meta and actions share one wrapping row rather than sitting in two
       columns: on a phone the meta needs two lines, and a fixed action column
       beside it then floats in the gap between them, aligned to neither. In one
       row the buttons stay on the meta's line while there is room and drop to
       their own right-aligned line when there is not. -->
  <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
    <!-- Localized date with semantic <time>; clock time stays on `sm+` (phone
         width). Time.svelte handles locale, timezone (title) and the
         `datetime` attribute — no manual `, ` concatenation, so the stray
         "2026 , 13:40" (space before comma) cannot happen. -->
    <span class="inline-flex items-center gap-1">
      <Time iso={post.createdAt} kind="date" />
      <span class="hidden sm:inline">· <Time iso={post.createdAt} kind="time" /></span>
    </span>
    <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
    <ReactionCount icon="heart" count={post.likeCount} singular="like" size={13} />
    <ReactionCount icon="comment" count={post.commentCount} singular="response" size={13} />
    <span class="ml-auto flex shrink-0 items-center gap-1">
      <RecommendButton postId={post.id} recommended={post.recommended} recommendCount={post.recommendCount} size="xs" />
      <SaveToListButton postId={post.id} {signedIn} />
    </span>
  </div>
</article>
