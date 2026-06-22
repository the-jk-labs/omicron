<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  A single comment and (for top-level comments) its collapsible reply thread.
  Renders recursively for replies. All interaction state lives in the parent
  `Comments.svelte` and is shared through the `ui` object (one open reply/edit
  box at a time across the whole tree); `actions` carries the handlers.
-->
<script lang="ts">
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { Comment, User } from "$lib/types";
  import type { CommentActions, CommentUiState } from "$lib/components/comments";
  import Self from "$lib/components/CommentNode.svelte";

  let {
    comment,
    thread,
    user,
    ui,
    actions,
    field,
  }: {
    comment: Comment;
    thread: Comment;
    user: User | null;
    ui: CommentUiState;
    actions: CommentActions;
    field: string;
  } = $props();

  const isReply = $derived(comment.id !== thread.id);
</script>

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
    {#if ui.editingId === comment.id}
      <form onsubmit={(e) => actions.submitEdit(e, comment)} class="mt-2">
        <textarea
          bind:value={ui.editDraft}
          rows={2}
          maxlength={2000}
          placeholder="Edit your comment…"
          class={field}
        ></textarea>
        {#if ui.editError}<p class="text-destructive mt-1.5 text-sm">{ui.editError}</p>{/if}
        <div class="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" class="h-9 px-4 text-sm" onclick={() => (ui.editingId = null)}>
            Cancel
          </Button>
          <Button type="submit" variant="solid" class="h-9 px-4 text-sm" disabled={ui.editBusy || !ui.editDraft.trim()}>
            {ui.editBusy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    {:else}
      <p class="text-foreground-alt mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
    {/if}

    <!-- Actions (negative margin offsets the buttons' padding so the heart
         icon lines up with the author name + comment text above). -->
    {#if ui.editingId !== comment.id}
      <div class="-ml-2 mt-1.5 flex items-center gap-1">
        <Button
          onclick={() => actions.toggleLike(comment)}
          variant="ghost"
          class={`h-8 gap-1.5 px-2 text-xs ${comment.liked ? "text-foreground" : "text-muted-foreground"}`}
          aria-pressed={comment.liked}
          aria-label={comment.liked ? "Unlike" : "Like"}
        >
          <Icon name="heart" size={15} class={comment.liked ? "fill-current" : ""} />
          {#if comment.likeCount > 0}<span class="tabular-nums">{comment.likeCount}</span>{/if}
        </Button>
        <Button
          onclick={() => actions.openReply(comment, thread)}
          variant="ghost"
          class="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
        >
          <Icon name="reply" size={15} />
          Reply
        </Button>
        {#if actions.canEdit(comment)}
          <Button
            onclick={() => actions.openEdit(comment)}
            variant="ghost"
            class="text-muted-foreground h-8 gap-1.5 px-2 text-xs"
            aria-label="Edit comment"
          >
            <Icon name="edit" size={15} />
            Edit
          </Button>
        {/if}
        {#if actions.canDelete(comment)}
          <Button
            onclick={() => actions.deleteComment(comment, thread)}
            variant="ghost"
            class="text-muted-foreground hover:text-destructive h-8 gap-1.5 px-2 text-xs"
            disabled={ui.deleteBusy.has(comment.id)}
            aria-label="Delete comment"
          >
            <Icon name="trash" size={15} />
            Delete
          </Button>
        {/if}
      </div>
    {/if}

    <!-- Reply composer (appears under whichever comment was replied to) -->
    {#if ui.replyingTo === comment.id}
      <form onsubmit={(e) => actions.submitReply(e, comment, thread)} class="mt-3 flex gap-3">
        <Avatar name={user?.displayName ?? "?"} src={user?.avatarUrl ?? undefined} size={28} />
        <div class="flex-1">
          <textarea
            bind:value={ui.replyDraft}
            rows={2}
            maxlength={2000}
            placeholder={`Reply to ${comment.author.displayName}…`}
            class={field}
          ></textarea>
          {#if ui.replyError}<p class="text-destructive mt-1.5 text-sm">{ui.replyError}</p>{/if}
          <div class="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" class="h-9 px-4 text-sm" onclick={() => (ui.replyingTo = null)}>
              Cancel
            </Button>
            <Button type="submit" variant="solid" class="h-9 px-4 text-sm" disabled={ui.replyBusy || !ui.replyDraft.trim()}>
              {ui.replyBusy ? "Posting…" : "Reply"}
            </Button>
          </div>
        </div>
      </form>
    {/if}

    <!-- Thread: collapsible flat list of replies (top-level only) -->
    {#if !isReply && comment.replies.length > 0}
      <Button
        onclick={() => actions.toggleThread(comment.id)}
        variant="ghost"
        class="text-accent hover:text-accent -ml-2 mt-2 h-8 gap-1.5 px-2 text-xs font-semibold"
      >
        <Icon name="chevronDown" size={15} class={`transition-transform ${ui.expanded.has(comment.id) ? "rotate-180" : ""}`} />
        {ui.expanded.has(comment.id) ? "Hide" : `${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
      </Button>
      {#if ui.expanded.has(comment.id)}
        <ul class="mt-4 flex flex-col gap-4 border-l border-border pl-4">
          {#each comment.replies as reply (reply.id)}
            <Self comment={reply} thread={comment} {user} {ui} {actions} {field} />
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</li>
