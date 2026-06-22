<script lang="ts">
  import { DropdownMenu, Separator } from "bits-ui";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
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
  let deleting = $state(false);

  // Authoring controls: edit is author-only; delete is author or admin. Neither
  // applies to federated posts owned by a remote instance.
  const canEdit = $derived(!!data.user && !post.remote && data.user.id === post.author.id);
  const canManage = $derived(
    !!data.user && !post.remote && (data.user.id === post.author.id || data.user.isAdmin),
  );

  // Verbatim Bits UI docs DropdownMenu.Item class (v3 syntax).
  const itemClass =
    "rounded-button data-[highlighted]:bg-muted !ring-0 !ring-transparent flex h-10 w-full cursor-pointer select-none items-center gap-2.5 py-3 pl-3 pr-1.5 text-sm font-medium focus-visible:outline-none";

  async function deletePost() {
    if (deleting) return;
    if (!confirm("Delete this post? This can't be undone.")) return;
    deleting = true;
    try {
      await endpoints().deletePost(post.id);
      goto("/");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete.");
      deleting = false;
    }
  }

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
    <Avatar name={post.author.displayName} src={post.author.avatarUrl ?? undefined} size={44} />
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

    {#if canManage}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="border-input text-muted-foreground shadow-btn hover:bg-muted hover:text-foreground ml-auto inline-flex size-9 items-center justify-center rounded-full border active:scale-[0.98]"
          aria-label="Post options"
        >
          <Icon name="more" size={18} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            sideOffset={8}
            align="end"
            class="border-muted bg-background shadow-popover z-30 w-[180px] rounded-xl border px-1 py-1.5 focus-visible:outline-none"
          >
            {#if canEdit}
              <DropdownMenu.Item onSelect={() => goto(`/posts/${post.id}/edit`)} class={itemClass}>
                <Icon name="edit" size={18} /> Edit
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Item onSelect={deletePost} class={`${itemClass} text-destructive`}>
              <Icon name="trash" size={18} /> Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}
  </div>

  <!-- Content is server-rendered HTML produced by the Tiptap editor. -->
  <div class="prose-omicron">
    {@html post.contentHtml}
  </div>

  <!-- Engagement bar -->
  <div class="mt-10 flex items-center gap-2 border-y border-border py-2.5">
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
