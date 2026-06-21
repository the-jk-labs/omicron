<script lang="ts">
  import { Separator } from "bits-ui";
  import { goto } from "$app/navigation";
  import { endpoints } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Comments from "$lib/components/Comments.svelte";
  import { formatDate, readTime } from "$lib/format";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const post = $derived(data.post);
  const minutes = $derived(readTime(post.contentHtml));

  // Like state is seeded from the SSR payload (viewer-aware) and updated locally.
  let liked = $state(data.post.liked);
  let likeCount = $state(data.post.likeCount);
  let commentCount = $state(data.post.commentCount);
  let busy = $state(false);

  async function toggleLike() {
    if (!data.user) {
      goto("/login");
      return;
    }
    if (busy) return;
    busy = true;
    // Optimistic update.
    const wasLiked = liked;
    liked = !liked;
    likeCount += liked ? 1 : -1;
    try {
      const res = wasLiked
        ? await endpoints().unlikePost(post.id)
        : await endpoints().likePost(post.id);
      liked = res.liked;
      likeCount = res.likeCount;
    } catch {
      // Revert on failure.
      liked = wasLiked;
      likeCount += wasLiked ? 1 : -1;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{post.title ?? "Post"} · Omicron</title></svelte:head>

<article>
  {#if post.title}
    <h1 class="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground">{post.title}</h1>
  {/if}

  <div class="flex items-center gap-3 pb-8">
    <Avatar name={post.author.displayName} size={44} />
    <div class="text-sm">
      <Button href={`/@${post.author.username}`} variant="plain" class="font-medium text-foreground hover:underline">
        {post.author.displayName}
      </Button>
      <div class="flex items-center gap-2 text-muted-foreground">
        <span>{formatDate(post.createdAt)}</span>
        <Separator.Root orientation="vertical" class="bg-border shrink-0 data-[orientation=vertical]:h-3 data-[orientation=vertical]:w-px" />
        <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
        {#if post.remote}
          <Separator.Root orientation="vertical" class="bg-border shrink-0 data-[orientation=vertical]:h-3 data-[orientation=vertical]:w-px" />
          <span class="flex items-center gap-1"><Icon name="globe" size={13} /> Federated</span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Engagement bar -->
  <div class="flex items-center gap-2 border-y border-border py-2.5">
    <Button
      onclick={toggleLike}
      variant="ghost"
      class={liked ? "text-foreground" : "text-muted-foreground"}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
    >
      <Icon name="heart" size={18} class={liked ? "fill-current" : ""} />
      <span class="tabular-nums">{likeCount}</span>
    </Button>
    <a href="#responses" class="text-muted-foreground hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-input px-3 text-sm font-medium">
      <Icon name="comment" size={18} />
      <span class="tabular-nums">{commentCount}</span>
    </a>
  </div>

  <!-- Content is server-rendered HTML produced by the Tiptap editor. -->
  <div class="prose-omicron mt-8">
    {@html post.contentHtml}
  </div>
</article>

<Separator.Root class="bg-border my-10 shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full" />

<div id="responses">
  <Comments
    postId={post.id}
    initial={data.comments}
    user={data.user}
    onCountChange={(delta) => (commentCount += delta)}
  />
</div>
