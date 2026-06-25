<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import CommentNode from "$lib/components/CommentNode.svelte";
  import type { CommentActions, CommentUiState } from "$lib/components/comments";
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

  // All per-interaction UI state, shared by reference with every CommentNode so
  // that at most one reply box / edit box is open across the tree at a time.
  let ui = $state<CommentUiState>({
    editingId: null,
    editDraft: "",
    editBusy: false,
    editError: "",
    replyingTo: null,
    replyDraft: "",
    replyBusy: false,
    replyError: "",
    likeBusy: new Set(),
    deleteBusy: new Set(),
    expanded: new Set(),
  });

  function toggleThread(threadId: string) {
    if (ui.expanded.has(threadId)) ui.expanded.delete(threadId);
    else ui.expanded.add(threadId);
    ui.expanded = new Set(ui.expanded);
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
    if (ui.replyingTo === target.id) {
      ui.replyingTo = null;
      return;
    }
    ui.replyingTo = target.id;
    ui.replyDraft = target.id === thread.id ? "" : `@${target.author.displayName} `;
    ui.replyError = "";
    ui.expanded.add(thread.id);
    ui.expanded = new Set(ui.expanded);
  }

  async function submitReply(e: SubmitEvent, target: Comment, thread: Comment) {
    e.preventDefault();
    if (!ui.replyDraft.trim()) return;
    ui.replyError = "";
    ui.replyBusy = true;
    try {
      // The backend flattens to one level, so every reply lands in the same
      // thread regardless of which comment was replied to.
      const { comment } = await endpoints().createComment(postId, ui.replyDraft, target.id);
      thread.replies = [...thread.replies, comment];
      ui.expanded.add(thread.id);
      ui.expanded = new Set(ui.expanded);
      ui.replyingTo = null;
      ui.replyDraft = "";
      onCountChange?.(1);
    } catch (err) {
      ui.replyError = err instanceof ApiError ? err.message : "Failed to post reply.";
    } finally {
      ui.replyBusy = false;
    }
  }

  async function toggleLike(comment: Comment) {
    if (!user) {
      goto("/login");
      return;
    }
    if (ui.likeBusy.has(comment.id)) return;
    ui.likeBusy.add(comment.id);
    ui.likeBusy = new Set(ui.likeBusy);

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
      ui.likeBusy.delete(comment.id);
      ui.likeBusy = new Set(ui.likeBusy);
    }
  }

  // The viewer may delete their own comments; admins may delete any.
  const canDelete = (comment: Comment) =>
    !!user && (user.id === comment.author.id || user.isAdmin);

  // Only the author may edit their own comment.
  const canEdit = (comment: Comment) => !!user && user.id === comment.author.id;

  function openEdit(comment: Comment) {
    ui.editingId = comment.id;
    ui.editDraft = comment.content;
    ui.editError = "";
  }

  async function submitEdit(e: SubmitEvent, comment: Comment) {
    e.preventDefault();
    const text = ui.editDraft.trim();
    if (!text || text === comment.content) {
      ui.editingId = null;
      return;
    }
    ui.editError = "";
    ui.editBusy = true;
    try {
      const { comment: updated } = await endpoints().editComment(postId, comment.id, text);
      comment.content = updated.content;
      ui.editingId = null;
      ui.editDraft = "";
    } catch (err) {
      ui.editError = err instanceof ApiError ? err.message : "Failed to save changes.";
    } finally {
      ui.editBusy = false;
    }
  }

  async function deleteComment(comment: Comment, thread: Comment) {
    if (!canDelete(comment)) return;
    if (ui.deleteBusy.has(comment.id)) return;
    const ok = await confirm({
      title: "Delete comment",
      description: "Delete this comment? This can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;

    ui.deleteBusy.add(comment.id);
    ui.deleteBusy = new Set(ui.deleteBusy);
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
      ui.deleteBusy.delete(comment.id);
      ui.deleteBusy = new Set(ui.deleteBusy);
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

  // Bundled once and passed down to every CommentNode.
  const actions: CommentActions = {
    toggleLike,
    openReply,
    submitReply,
    openEdit,
    submitEdit,
    deleteComment,
    toggleThread,
    canEdit,
    canDelete,
  };
</script>

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
          <Button type="submit" variant="solid" size="sm" disabled={busy || !draft.trim()}>
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
        <CommentNode {comment} thread={comment} {user} {ui} {actions} {field} />
      {/each}
    </ul>

    {#if cursor}
      <div class="mt-6 flex justify-center">
        <Button onclick={loadMore} disabled={loadingMore} variant="outline" size="sm">
          {loadingMore ? "Loading…" : "Show more responses"}
        </Button>
      </div>
    {/if}
  {/if}
</section>
