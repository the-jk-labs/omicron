<script lang="ts">
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { Comment, Page, User } from "$lib/types";

  let {
    postId,
    initial,
    user,
    onCountChange,
  }: {
    postId: string;
    initial: Page<Comment>;
    user: User | null;
    onCountChange?: (delta: number) => void;
  } = $props();

  let comments = $state<Comment[]>(initial.items);
  let cursor = $state<string | null>(initial.nextCursor);
  let draft = $state("");
  let error = $state("");
  let busy = $state(false);
  let loadingMore = $state(false);

  // Inline reply state: at most one open reply box at a time.
  let replyingTo = $state<string | null>(null);
  let replyDraft = $state("");
  let replyBusy = $state(false);
  let replyError = $state("");

  // Guards against double-firing a like toggle for the same comment.
  let likeBusy = $state<Set<string>>(new Set());

  // Total responses = top-level comments + every reply.
  const total = $derived(
    comments.reduce((n, c) => n + 1 + c.replies.length, 0),
  );

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    error = "";
    busy = true;
    try {
      const { comment } = await endpoints().createComment(postId, draft);
      comments = [comment, ...comments];
      draft = "";
      onCountChange?.(1);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to post comment.";
    } finally {
      busy = false;
    }
  }

  function openReply(commentId: string) {
    if (!user) {
      goto("/login");
      return;
    }
    replyingTo = replyingTo === commentId ? null : commentId;
    replyDraft = "";
    replyError = "";
  }

  async function submitReply(e: SubmitEvent, parent: Comment) {
    e.preventDefault();
    if (!replyDraft.trim()) return;
    replyError = "";
    replyBusy = true;
    try {
      const { comment } = await endpoints().createComment(postId, replyDraft, parent.id);
      parent.replies = [...parent.replies, comment];
      replyingTo = null;
      replyDraft = "";
      onCountChange?.(1);
    } catch (err) {
      replyError = err instanceof ApiError ? err.message : "Failed to post reply.";
    } finally {
      replyBusy = false;
    }
  }

  async function toggleLike(comment: Comment) {
    if (!user) {
      goto("/login");
      return;
    }
    if (likeBusy.has(comment.id)) return;
    likeBusy.add(comment.id);
    likeBusy = new Set(likeBusy);

    const wasLiked = comment.liked;
    comment.liked = !wasLiked;
    comment.likeCount += wasLiked ? -1 : 1;
    try {
      const res = wasLiked
        ? await endpoints().unlikeComment(postId, comment.id)
        : await endpoints().likeComment(postId, comment.id);
      comment.liked = res.liked;
      comment.likeCount = res.likeCount;
    } catch {
      comment.liked = wasLiked;
      comment.likeCount += wasLiked ? 1 : -1;
    } finally {
      likeBusy.delete(comment.id);
      likeBusy = new Set(likeBusy);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    loadingMore = true;
    try {
      const next = await endpoints().comments(postId, cursor);
      comments = [...comments, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loadingMore = false;
    }
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn w-full px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground resize-none";
</script>

{#snippet commentNode(comment: Comment, isReply: boolean)}
  <li class="flex gap-3">
    <Avatar
      name={comment.author.displayName}
      src={comment.author.avatarUrl ?? undefined}
      size={isReply ? 28 : 36}
    />
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2 text-sm">
        <a href={`/@${comment.author.username}`} class="text-foreground font-medium hover:underline">
          {comment.author.displayName}
        </a>
        <span class="text-muted-foreground text-xs">{formatDate(comment.createdAt)}</span>
      </div>
      <p class="text-foreground-alt mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>

      <!-- Actions -->
      <div class="mt-1.5 flex items-center gap-1">
        <Button
          onclick={() => toggleLike(comment)}
          variant="ghost"
          class={`h-8 gap-1.5 px-2 text-xs ${comment.liked ? "text-foreground" : "text-muted-foreground"}`}
          aria-pressed={comment.liked}
          aria-label={comment.liked ? "Unlike" : "Like"}
        >
          <Icon name="heart" size={15} class={comment.liked ? "fill-current" : ""} />
          {#if comment.likeCount > 0}<span class="tabular-nums">{comment.likeCount}</span>{/if}
        </Button>
        {#if !isReply}
          <Button
            onclick={() => openReply(comment.id)}
            variant="ghost"
            class="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
          >
            <Icon name="reply" size={15} />
            Reply
            {#if comment.replies.length > 0}<span class="tabular-nums">{comment.replies.length}</span>{/if}
          </Button>
        {/if}
      </div>

      <!-- Reply composer -->
      {#if !isReply && replyingTo === comment.id}
        <form onsubmit={(e) => submitReply(e, comment)} class="mt-3 flex gap-3">
          <Avatar name={user?.displayName ?? "?"} src={user?.avatarUrl ?? undefined} size={28} />
          <div class="flex-1">
            <textarea
              bind:value={replyDraft}
              rows={2}
              maxlength={2000}
              placeholder={`Reply to ${comment.author.displayName}…`}
              class={field}
            ></textarea>
            {#if replyError}<p class="text-destructive mt-1.5 text-sm">{replyError}</p>{/if}
            <div class="mt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" class="h-9 px-4 text-sm" onclick={() => (replyingTo = null)}>
                Cancel
              </Button>
              <Button type="submit" variant="solid" class="h-9 px-4 text-sm" disabled={replyBusy || !replyDraft.trim()}>
                {replyBusy ? "Posting…" : "Reply"}
              </Button>
            </div>
          </div>
        </form>
      {/if}

      <!-- Replies -->
      {#if !isReply && comment.replies.length > 0}
        <ul class="mt-4 flex flex-col gap-4 border-l border-border pl-4">
          {#each comment.replies as reply (reply.id)}
            {@render commentNode(reply, true)}
          {/each}
        </ul>
      {/if}
    </div>
  </li>
{/snippet}

<section class="mt-2">
  <h2 class="text-foreground mb-5 text-lg font-semibold tracking-tight">
    Responses ({total})
  </h2>

  {#if user}
    <form onsubmit={submit} class="mb-8 flex gap-3">
      <Avatar name={user.displayName} src={user.avatarUrl ?? undefined} size={36} />
      <div class="flex-1">
        <textarea
          bind:value={draft}
          rows={2}
          maxlength={2000}
          placeholder="What are your thoughts?"
          class={field}
        ></textarea>
        {#if error}<p class="text-destructive mt-1.5 text-sm">{error}</p>{/if}
        <div class="mt-2 flex justify-end">
          <Button type="submit" variant="solid" class="h-9 px-4 text-sm" disabled={busy || !draft.trim()}>
            {busy ? "Posting…" : "Respond"}
          </Button>
        </div>
      </div>
    </form>
  {:else}
    <p class="text-muted-foreground mb-8 text-sm">
      <Button href="/login" variant="link">Sign in</Button> to leave a response.
    </p>
  {/if}

  {#if comments.length === 0}
    <p class="text-muted-foreground py-6 text-center text-sm">No responses yet. Be the first.</p>
  {:else}
    <ul class="flex flex-col gap-6">
      {#each comments as comment (comment.id)}
        {@render commentNode(comment, false)}
      {/each}
    </ul>

    {#if cursor}
      <div class="mt-6 flex justify-center">
        <Button onclick={loadMore} disabled={loadingMore} variant="outline" class="h-9 px-4 text-sm">
          {loadingMore ? "Loading…" : "Show more responses"}
        </Button>
      </div>
    {/if}
  {/if}
</section>
