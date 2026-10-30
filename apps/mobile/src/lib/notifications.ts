import type { Notification } from "@omicron/contract";
import type { IconName } from "@/components/ui/icon";

// Ported from apps/frontend/src/lib/components/notifications.ts; keep the wording identical.

/** The bold half of a notification line: normally who did it. */
export function notificationSubject(n: Notification): string {
  if (n.type === "post_published") return "Your scheduled post";
  return n.actor?.displayName ?? "Someone";
}

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
    case "recommend":
      return "recommended your post";
    case "post_published":
      return "is now live";
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export function notificationIcon(type: Notification["type"]): IconName {
  switch (type) {
    case "follow":
    case "follow_accepted":
      return "user-plus";
    case "follow_request":
      return "lock";
    case "like":
    case "comment_like":
      return "heart";
    case "comment":
      return "message-circle";
    case "reply":
      return "reply";
    case "recommend":
      return "repeat-2";
    case "post_published":
      return "clock";
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

/** Where tapping the row goes: the request inbox, the actor's profile, or the post. */
export function notificationHref(n: Notification): string | null {
  if (n.type === "follow_request") return "/follow-requests";
  if (n.type === "follow" || n.type === "follow_accepted") return n.actor ? `/@${n.actor.username}` : null;
  return n.postId ? `/posts/${n.postId}` : null;
}
