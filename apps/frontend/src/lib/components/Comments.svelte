<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
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

<section class="mt-2">
  <h2 class="text-foreground mb-5 text-lg font-semibold tracking-tight">
    Responses ({comments.length})
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
        <li class="flex gap-3">
          <Avatar name={comment.author.displayName} size={36} />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-sm">
              <a href={`/@${comment.author.username}`} class="text-foreground font-medium hover:underline">
                {comment.author.displayName}
              </a>
              <span class="text-muted-foreground text-xs">{formatDate(comment.createdAt)}</span>
            </div>
            <p class="text-foreground-alt mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
          </div>
        </li>
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
