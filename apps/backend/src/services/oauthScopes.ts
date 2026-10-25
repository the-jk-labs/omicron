// SPDX-License-Identifier: AGPL-3.0-or-later
import { OAuthError } from "@/lib/oauthError.ts";

export const IDENTITY_SCOPE = "read:accounts";
export const OAUTH_SCOPES = {
  read: "Read your account details (including email), private posts, feeds, lists, relationships, notifications, analytics, and publishing integration metadata.",
  write:
    "Publish, edit and delete your content; change your profile, relationships, and lists; create publishing tokens that can outlive this access.",
  "read:accounts": "Verify your public identity only (ID, username, display name, and profile URLs).",
  "read:profile": "Read your account details, including your email address, and view profiles.",
  "write:accounts": "Edit your profile, avatar, privacy, and preferences (not your login credentials).",
  "read:posts": "Read posts, including your drafts, scheduled posts, and personalized feed.",
  "write:posts": "Create, edit, schedule, delete, like, and recommend posts.",
  "read:comments": "Read comments and their engagement state.",
  "write:comments": "Create, edit, delete, and like comments.",
  "read:lists": "Read your reading lists, including private lists and saved posts.",
  "write:lists": "Create, edit, and delete reading lists and save or remove posts.",
  "read:follows": "Read follows, followers, followed tags, and pending follow requests.",
  "write:follows": "Follow or unfollow people and tags, remove followers, and decide follow requests.",
  "read:blocks": "Read your blocked accounts.",
  "write:blocks": "Block and unblock accounts.",
  "read:mutes": "Read your muted accounts.",
  "write:mutes": "Mute and unmute accounts.",
  "read:notifications": "Read your notifications and unread count.",
  "write:notifications": "Mark your notifications as read.",
  "read:analytics": "Read your writer dashboard and article statistics.",
  "read:search": "Search articles, people, and tags.",
  "write:media": "Upload images and use the instance's stock-photo providers.",
  "write:reports": "Report posts and accounts.",
  "read:integrations": "List your publishing integrations.",
  "write:integrations": "Create and revoke publishing tokens that can outlive this application's access.",
  "admin:read": "Read moderation and instance administration data, if your role permits it.",
  "admin:write": "Perform moderation and change instance administration settings, if your role permits it.",
} as const;
export type OAuthScope = keyof typeof OAUTH_SCOPES;

export function parseScopes(value: unknown): string {
  if (typeof value !== "string" || value.length > 1000 || !value || /[^\x20-\x7e]/.test(value)) {
    throw new OAuthError("invalid_scope", "Request a space-separated list of supported scopes.");
  }
  const scopes = value.split(" ");
  if (scopes.some((scope) => !Object.hasOwn(OAUTH_SCOPES, scope)) || new Set(scopes).size !== scopes.length) {
    throw new OAuthError("invalid_scope", "Unknown, empty, or duplicate scope.");
  }
  return scopes.toSorted().join(" ");
}

export function hasScope(granted: string, required: string): boolean {
  const scopes = granted.split(" ");
  const parent = required.split(":")[0];
  return scopes.includes(required) || ((parent === "read" || parent === "write") && scopes.includes(parent));
}

export function scopesInclude(granted: string, requested: string): boolean {
  return requested.split(" ").every((scope) => hasScope(granted, scope));
}

export function permissions(scopes: string) {
  return scopes.split(" ").map((scope) => ({ scope, description: OAUTH_SCOPES[scope as OAuthScope] }));
}
