// SPDX-License-Identifier: AGPL-3.0-or-later
import type { OAuthScope } from "@/services/oauthScopes.ts";

type Access = { method: string; path: string; scope: OAuthScope | null };
const operations: Access[] = [];
function allow(scope: OAuthScope | null, method: string, ...paths: string[]) {
  for (const path of paths) operations.push({ method, path: `/api${path}`, scope });
}

allow("read:profile", "GET", "/me", "/users/suggested", "/users/:username", "/remote/users/:handle");
allow("write:accounts", "PATCH", "/users/me", "/users/me/privacy", "/users/me/preferences");
allow("write:accounts", "POST", "/users/me/custom-section/preview", "/users/me/avatar");
allow("write:accounts", "DELETE", "/users/me/avatar");
allow(
  "read:follows",
  "GET",
  "/users/me/follow-requests",
  "/users/:username/followers",
  "/users/:username/following",
  "/tags/following",
);
allow(
  "write:follows",
  "POST",
  "/users/me/follow-requests/:id/approve",
  "/users/me/follow-requests/:id/reject",
  "/users/:username/follow",
  "/remote/users/:handle/follow",
  "/tags/:slug/follow",
);
allow(
  "write:follows",
  "DELETE",
  "/users/me/followers/:identifier",
  "/users/:username/follow",
  "/remote/users/:handle/follow",
  "/tags/:slug/follow",
);
allow("read:blocks", "GET", "/users/me/blocked");
allow("read:mutes", "GET", "/users/me/muted");
for (const relation of ["mute", "block"] as const) {
  for (const method of ["POST", "DELETE"])
    allow(`write:${relation}s`, method, `/users/:username/${relation}`, `/remote/users/:handle/${relation}`);
}
allow(
  "read:posts",
  "GET",
  "/posts",
  "/posts/drafts",
  "/posts/mine",
  "/posts/mine/counts",
  "/posts/trending",
  "/posts/random",
  "/posts/by/:username/:slug",
  "/posts/:id",
  "/posts/:id/related",
  "/feed",
  "/users/:username/posts",
  "/users/:username/recommendations",
  "/remote/users/:handle/posts",
  "/remote/users/:handle/recommendations",
  "/tags/:slug/posts",
);
allow("write:posts", "POST", "/posts", "/posts/:id/like", "/posts/:id/recommend");
allow("write:posts", "PATCH", "/posts/:id");
allow("write:posts", "DELETE", "/posts/:id", "/posts/:id/like", "/posts/:id/recommend");
allow("read:comments", "GET", "/posts/:id/comments");
allow("write:comments", "POST", "/posts/:id/comments", "/posts/:id/comments/:commentId/like");
allow("write:comments", "PATCH", "/posts/:id/comments/:commentId");
allow("write:comments", "DELETE", "/posts/:id/comments/:commentId", "/posts/:id/comments/:commentId/like");
allow(
  "read:lists",
  "GET",
  "/lists",
  "/lists/read-later",
  "/lists/user/:username",
  "/lists/for-post/:postId",
  "/lists/:id",
  "/lists/:id/items",
);
allow("write:lists", "POST", "/lists", "/lists/:id/items");
allow("write:lists", "PATCH", "/lists/:id");
allow("write:lists", "DELETE", "/lists/:id", "/lists/:id/items/:postId");
allow("read:notifications", "GET", "/notifications", "/notifications/unread-count");
allow("write:notifications", "POST", "/notifications/read", "/notifications/:id/read");
allow("read:analytics", "GET", "/dashboard");
allow("read:search", "GET", "/search", "/tags", "/tags/suggest", "/tags/search", "/tags/:slug");
allow("write:media", "POST", "/uploads", "/photos/use");
allow("write:media", "GET", "/photos/providers", "/photos/search");
allow("write:reports", "POST", "/reports");
allow("read:integrations", "GET", "/webhooks/tokens");
allow("write:integrations", "POST", "/webhooks/tokens");
allow("write:integrations", "DELETE", "/webhooks/tokens/:id");
allow(
  "admin:read",
  "GET",
  "/admin/settings",
  "/admin/umami",
  "/admin/security",
  "/admin/security/access-rules",
  "/admin/seo",
  "/admin/unsplash",
  "/admin/instance",
  "/admin/email",
  "/admin/email/dns",
  "/admin/email/port25",
  "/admin/users",
  "/admin/users/deleted",
  "/admin/users/:id",
  "/admin/reports",
  "/admin/domains",
  "/admin/tags/aliases",
);
allow(
  "admin:write",
  "PUT",
  "/admin/settings/analytics",
  "/admin/umami",
  "/admin/security/anubis",
  "/admin/seo",
  "/admin/unsplash",
  "/admin/instance",
  "/admin/email",
);
allow(
  "admin:write",
  "POST",
  "/admin/security/access-rules",
  "/admin/security/access-rules/test",
  "/admin/instance/banner",
  "/admin/instance/rotate-secret",
  "/admin/email/dkim",
  "/admin/email/test",
  "/admin/users/:id/suspend",
  "/admin/users/:id/delete",
  "/admin/users/:id/restore",
  "/admin/users/:id/role",
  "/admin/users/:id/moderator-role",
  "/admin/users/:id/avatar",
  "/admin/users/:id/verification-email",
  "/admin/users/:id/verify",
  "/admin/posts/:id/ai-assisted",
  "/admin/reports/:id/resolve",
  "/admin/domains",
  "/admin/tags/alias",
  "/admin/tags/merge",
);
allow("admin:write", "PATCH", "/admin/security/access-rules/:id", "/admin/users/:id");
allow(
  "admin:write",
  "DELETE",
  "/admin/security/access-rules/:id",
  "/admin/instance/banner",
  "/admin/users/deleted/:id",
  "/admin/users/:id/avatar",
  "/admin/posts/:id",
  "/admin/posts/:id/ai-assisted",
  "/admin/domains/:domain",
);
allow(
  "read",
  "GET",
  "/instance",
  "/client",
  "/seo",
  "/seo/indexnow-key/:key",
  "/seo/sitemap-entries",
  "/seo/sitemap-posts",
  "/site",
  "/media/proxy",
  "/uploads/og/:file",
  "/uploads/:file",
  "/og/posts/:file",
  "/og/profiles/:file",
);
allow(null, "GET", "/instance/tls-check", "/site/script.js");
allow(null, "POST", "/setup", "/setup/test-email", "/email-change/undo", "/site/api/send", "/webhooks/content");

export const clientOperations: readonly Access[] = operations;

// Exact endpoint allowlist: new routes are not implicitly delegated to existing grants.
export function clientAccess(method: string, path: string): Access | undefined {
  return operations.find(
    (operation) =>
      operation.method === (method === "HEAD" ? "GET" : method) && operation.path === path.replace(/\/$/, ""),
  );
}
