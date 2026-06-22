<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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

  // Guards against double-firing a like toggle / delete for the same comment.
  let likeBusy = $state<Set<string>>(new Set());
  let deleteBusy = $state<Set<string>>(new Set());

  // Inline edit state: at most one comment is edited at a time.
  let editingId = $state<string | null>(null);
  let editDraft = $state("");
  let editBusy = $state(false);
  let editError = $state("");

  // Top-level comment ids whose reply threads are expanded (YouTube-style).
  let expanded = $state<Set<string>>(new Set());

  function toggleThread(threadId: string) {
    if (expanded.has(threadId)) expanded.delete(threadId);
    else expanded.add(threadId);
    expanded = new Set(expanded);
  }

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

  // `target` is the comment being replied to; `thread` is its top-level root.
  // Replying to a reply pre-fills an @mention, just like YouTube.
  function openReply(target: Comment, thread: Comment) {
    if (!user) {
      goto("/login");
      return;
    }
    if (replyingTo === target.id) {
      replyingTo = null;
      return;
    }
    replyingTo = target.id;
    replyDraft = target.id === thread.id ? "" : `@${target.author.displayName} `;
    replyError = "";
    expanded.add(thread.id);
    expanded = new Set(expanded);
  }

  async function submitReply(e: SubmitEvent, target: Comment, thread: Comment) {
    e.preventDefault();
    if (!replyDraft.trim()) return;
    replyError = "";
    replyBusy = true;
    try {
      // The backend flattens to one level, so every reply lands in the same
      // thread regardless of which comment was replied to.
      const { comment } = await endpoints().createComment(postId, replyDraft, target.id);
      thread.replies = [...thread.replies, comment];
      expanded.add(thread.id);
      expanded = new Set(expanded);
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

  // The viewer may delete their own comments; admins may delete any.
  const canDelete = (comment: Comment) =>
    !!user && (user.id === comment.author.id || user.isAdmin);

  // Only the author may edit their own comment.
  const canEdit = (comment: Comment) => !!user && user.id === comment.author.id;

  function openEdit(comment: Comment) {
    editingId = comment.id;
    editDraft = comment.content;
    editError = "";
  }

  async function submitEdit(e: SubmitEvent, comment: Comment) {
    e.preventDefault();
    const text = editDraft.trim();
    if (!text || text === comment.content) {
      editingId = null;
      return;
    }
    editError = "";
    editBusy = true;
    try {
      const { comment: updated } = await endpoints().editComment(postId, comment.id, text);
      comment.content = updated.content;
      editingId = null;
      editDraft = "";
    } catch (err) {
      editError = err instanceof ApiError ? err.message : "Failed to save changes.";
    } finally {
      editBusy = false;
    }
  }

  async function deleteComment(comment: Comment, thread: Comment) {
    if (!canDelete(comment)) return;
    if (deleteBusy.has(comment.id)) return;
    if (!confirm("Delete this comment? This can't be undone.")) return;

    deleteBusy.add(comment.id);
    deleteBusy = new Set(deleteBusy);
    try {
      await endpoints().deleteComment(postId, comment.id);
      if (comment.id === thread.id) {
        // Top-level: drop it and account for its replies in the count.
        comments = comments.filter((c) => c.id !== comment.id);
        onCountChange?.(-(1 + comment.replies.length));
      } else {
        thread.replies = thread.replies.filter((r) => r.id !== comment.id);
        onCountChange?.(-1);
      }
    } catch {
      // Leave the comment in place on failure.
    } finally {
      deleteBusy.delete(comment.id);
      deleteBusy = new Set(deleteBusy);
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

{#snippet commentNode(comment: Comment, thread: Comment)}
  {@const isReply = comment.id !== thread.id}
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
      {#if editingId === comment.id}
        <form onsubmit={(e) => submitEdit(e, comment)} class="mt-2">
          <textarea
            bind:value={editDraft}
            rows={2}
            maxlength={2000}
            placeholder="Edit your comment…"
            class={field}
          ></textarea>
          {#if editError}<p class="text-destructive mt-1.5 text-sm">{editError}</p>{/if}
          <div class="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" class="h-9 px-4 text-sm" onclick={() => (editingId = null)}>
              Cancel
            </Button>
            <Button type="submit" variant="solid" class="h-9 px-4 text-sm" disabled={editBusy || !editDraft.trim()}>
              {editBusy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      {:else}
        <p class="text-foreground-alt mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
      {/if}

      <!-- Actions (negative margin offsets the buttons' padding so the heart
           icon lines up with the author name + comment text above). -->
      {#if editingId !== comment.id}
        <div class="-ml-2 mt-1.5 flex items-center gap-1">
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
          <Button
            onclick={() => openReply(comment, thread)}
            variant="ghost"
            class="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
          >
            <Icon name="reply" size={15} />
            Reply
          </Button>
          {#if canEdit(comment)}
            <Button
              onclick={() => openEdit(comment)}
              variant="ghost"
              class="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
              aria-label="Edit comment"
            >
              <Icon name="edit" size={15} />
              Edit
            </Button>
          {/if}
          {#if canDelete(comment)}
            <Button
              onclick={() => deleteComment(comment, thread)}
              variant="ghost"
              class="text-muted-foreground hover:text-destructive h-8 gap-1.5 px-2 text-xs"
              disabled={deleteBusy.has(comment.id)}
              aria-label="Delete comment"
            >
              <Icon name="trash" size={15} />
              Delete
            </Button>
          {/if}
        </div>
      {/if}

      <!-- Reply composer (appears under whichever comment was replied to) -->
      {#if replyingTo === comment.id}
        <form onsubmit={(e) => submitReply(e, comment, thread)} class="mt-3 flex gap-3">
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

      <!-- Thread: collapsible flat list of replies (top-level only) -->
      {#if !isReply && comment.replies.length > 0}
        <Button
          onclick={() => toggleThread(comment.id)}
          variant="ghost"
          class="text-accent hover:text-accent -ml-2 mt-2 h-8 gap-1.5 px-2 text-xs font-semibold"
        >
          <Icon name="chevronDown" size={15} class={`transition-transform ${expanded.has(comment.id) ? "rotate-180" : ""}`} />
          {expanded.has(comment.id) ? "Hide" : `${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
        </Button>
        {#if expanded.has(comment.id)}
          <ul class="mt-4 flex flex-col gap-4 border-l border-border pl-4">
            {#each comment.replies as reply (reply.id)}
              {@render commentNode(reply, comment)}
            {/each}
          </ul>
        {/if}
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
        {@render commentNode(comment, comment)}
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