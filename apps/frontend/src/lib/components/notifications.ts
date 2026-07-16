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
      return "follow";
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
  if (n.type === "follow") return n.actor ? `/@${n.actor.username}` : null;
  return n.postId ? `/posts/${n.postId}` : null;
}
