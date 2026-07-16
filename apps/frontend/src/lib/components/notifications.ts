// SPDX-License-Identifier: AGPL-3.0-or-later
// Presentation helpers shared by the nav bell dropdown and the /notifications
// page: the action phrase, the target link, and the leading icon for a row.
import type { IconName } from "$lib/components/Icon.svelte";
import type { Notification } from "$lib/types";

// The verb phrase after the actor's name, e.g. "started following you".
export function notificationAction(type: Notification["type"]): string {
  switch (type) {
    case "follow":
      return "started following you";
    case "follow_request":
      return "requested to follow you";
    case "follow_accepted":
      return "accepted your follow request";
    case "like":
      return "liked your post";
    case "comment":
      return "commented on your post";
    case "reply":
      return "replied to your comment";
    case "comment_like":
      return "liked your comment";
  }
}

// Leading icon for the row, mirroring the action.
export function notificationIcon(type: Notification["type"]): IconName {
  switch (type) {
    case "follow":
    case "follow_accepted":
      return "follow";
    case "follow_request":
      return "lock";
    case "like":
    case "comment_like":
      return "heart";
    case "comment":
      return "comment";
    case "reply":
      return "reply";
  }
}

// Where clicking the row goes: a follow points at the actor's profile; every
// other type points at the target post (/posts/:id redirects to canonical).
export function notificationHref(n: Notification): string | null {
  // A follow request points at your inbox to approve/reject; the others point at
  // the actor's profile (follow / accepted) or the target post.
  if (n.type === "follow_request") return "/follow-requests";
  if (n.type === "follow" || n.type === "follow_accepted") {
    return n.actor ? `/@${n.actor.username}` : null;
  }
  return n.postId ? `/posts/${n.postId}` : null;
}
