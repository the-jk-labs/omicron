// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared contracts between Comments.svelte (owns the state + handlers) and the
// recursive CommentNode.svelte (renders a single comment + its replies).
import type { Comment } from "$lib/types";

// Mutable per-interaction UI state, shared by reference across the whole tree so
// that only one reply box / one edit box is ever open at a time. Lives as a
// single $state object in Comments.svelte.
export type CommentUiState = {
  editingId: string | null;
  editDraft: string;
  editBusy: boolean;
  editError: string;
  replyingTo: string | null;
  replyDraft: string;
  replyBusy: boolean;
  replyError: string;
  // Guard sets keyed by comment id; replaced wholesale to trigger reactivity.
  likeBusy: Set<string>;
  deleteBusy: Set<string>;
  // Top-level comment ids whose reply threads are expanded.
  expanded: Set<string>;
};

// Handlers, all defined in Comments.svelte where they close over the comment list.
export type CommentActions = {
  toggleLike: (comment: Comment) => void;
  openReply: (target: Comment, thread: Comment) => void;
  submitReply: (e: SubmitEvent, target: Comment, thread: Comment) => void;
  openEdit: (comment: Comment) => void;
  submitEdit: (e: SubmitEvent, comment: Comment) => void;
  deleteComment: (comment: Comment, thread: Comment) => void;
  toggleThread: (threadId: string) => void;
  canEdit: (comment: Comment) => boolean;
  canDelete: (comment: Comment) => boolean;
};
