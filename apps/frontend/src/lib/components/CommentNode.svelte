<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  A single comment and (for top-level comments) its collapsible reply thread.
  Renders recursively for replies. All interaction state lives in the parent
  `Comments.svelte` and is shared through the `ui` object (one open reply/edit
  box at a time across the whole tree); `actions` carries the handlers.
-->
<script lang="ts">
  import { autoGrow } from "$lib/actions/autoGrow.svelte";
  import Self from "$lib/components/CommentNode.svelte";
  import type { CommentActions, CommentUiState } from "$lib/components/comments";
  import EmojiTrigger from "$lib/components/EmojiTrigger.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Time from "$lib/components/Time.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { insertEmojiIntoField, emojiOverlayBtn } from "$lib/emoji";
  import { countLabel } from "$lib/format";
  import type { Comment, User } from "$lib/types";

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
  // `aria-label` replaces the button's content as its accessible name, so the
  // like count has to be spoken in the label itself.
  const likeLabel = $derived(`${comment.liked ? "Unlike" : "Like"} (${countLabel(comment.likeCount, "like")})`);

  // Local refs for caret-aware emoji insertion into the edit/reply boxes. Only
  // one of each is ever open at a time (state lives in the shared `ui`).
  let editEl = $state<HTMLTextAreaElement | null>(null);
  let replyEl = $state<HTMLTextAreaElement | null>(null);
  const insertEditEmoji = (emoji: string) =>
    insertEmojiIntoField(editEl, ui.editDraft, 2000, emoji, (v) => (ui.editDraft = v));
  const insertReplyEmoji = (emoji: string) =>
    insertEmojiIntoField(replyEl, ui.replyDraft, 2000, emoji, (v) => (ui.replyDraft = v));
</script>

<li class="flex gap-3">
  <Avatar name={comment.author.displayName} src={comment.author.avatarUrl ?? undefined} size={isReply ? 28 : 36} />
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2 text-sm">
      <a href={`/@${comment.author.username}`} class="font-medium text-foreground hover:underline">
        {comment.author.displayName}
      </a>
      <Time iso={comment.createdAt} relative class="text-xs text-muted-foreground" />
    </div>
    {#if ui.editingId === comment.id}
      <form onsubmit={(e) => actions.submitEdit(e, comment)} class="mt-2">
        <div class="relative">
          <textarea
            bind:this={editEl}
            bind:value={ui.editDraft}
            use:autoGrow={() => ui.editDraft}
            rows={2}
            maxlength={2000}
            placeholder="Edit your comment…"
            class={`${field} pr-11`}></textarea>
          <EmojiTrigger onPick={insertEditEmoji} align="end" class={`${emojiOverlayBtn} right-1.5 bottom-2`} />
        </div>
        {#if ui.editError}<p class="mt-1.5 text-sm text-destructive">{ui.editError}</p>{/if}
        <div class="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onclick={() => (ui.editingId = null)}>Cancel</Button>
          <Button type="submit" variant="solid" size="sm" disabled={ui.editBusy || !ui.editDraft.trim()}>
            {ui.editBusy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    {:else}
      <p class="mt-1 text-sm wrap-break-word whitespace-pre-wrap text-foreground-alt">{comment.content}</p>
    {/if}

    <!-- Actions (negative margin offsets the buttons' padding so the heart
         icon lines up with the author name + comment text above). -->
    {#if ui.editingId !== comment.id}
      <div class="mt-1.5 -ml-2 flex items-center gap-1">
        <Button
          onclick={() => actions.toggleLike(comment)}
          variant="ghost"
          size="xs"
          class={comment.liked ? "text-foreground" : "text-muted-foreground"}
          aria-pressed={comment.liked}
          aria-label={likeLabel}
          title={likeLabel}
        >
          <Icon name="heart" size={15} class={comment.liked ? "fill-current" : ""} />
          {#if comment.likeCount > 0}<span class="tabular-nums">{comment.likeCount}</span>{/if}
        </Button>
        <Button
          onclick={() => actions.openReply(comment, thread)}
          variant="ghost"
          size="xs"
          class="text-muted-foreground"
        >
          <Icon name="reply" size={15} />
          Reply
        </Button>
        {#if actions.canEdit(comment)}
          <Button
            onclick={() => actions.openEdit(comment)}
            variant="ghost"
            size="xs"
            class="text-muted-foreground"
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
            size="xs"
            class="text-muted-foreground hover:text-destructive"
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
          <div class="relative">
            <textarea
              bind:this={replyEl}
              bind:value={ui.replyDraft}
              use:autoGrow={() => ui.replyDraft}
              rows={2}
              maxlength={2000}
              placeholder={`Reply to ${comment.author.displayName}…`}
              class={`${field} pr-11`}></textarea>
            <EmojiTrigger onPick={insertReplyEmoji} align="end" class={`${emojiOverlayBtn} right-1.5 bottom-2`} />
          </div>
          {#if ui.replyError}<p class="mt-1.5 text-sm text-destructive">{ui.replyError}</p>{/if}
          <div class="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onclick={() => (ui.replyingTo = null)}>Cancel</Button>
            <Button type="submit" variant="solid" size="sm" disabled={ui.replyBusy || !ui.replyDraft.trim()}>
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
        class="mt-2 -ml-2 h-8 gap-1.5 px-2 text-xs font-semibold text-accent hover:text-accent"
      >
        <Icon
          name="chevronDown"
          size={15}
          class={`transition-transform ${ui.expanded.has(comment.id) ? "rotate-180" : ""}`}
        />
        {ui.expanded.has(comment.id)
          ? "Hide"
          : `${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
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
