import * as c from "@omicron/contract";
import type { CoverCredit, OwnPostStatus, PhotoProvider } from "@omicron/contract";
import type { ApiClient } from "./client";

// The reader's feed language filter, forwarded to the timeline endpoints as
// query params (see prefs.svelte.ts `feedLangQuery`).
export type LangFilter = { langMode: "show" | "hide"; langs: string };

// Builds the `?scope=&cursor=&langMode=&langs=` query string for the public
// timelines, omitting whatever isn't set.
function timelineQuery(cursor?: string | null, langFilter?: LangFilter | null, scope?: FeedTab): string {
  const params = new URLSearchParams();
  if (scope) params.set("scope", scope);
  if (cursor) params.set("cursor", cursor);
  if (langFilter && langFilter.langs) {
    params.set("langMode", langFilter.langMode);
    params.set("langs", langFilter.langs);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type FeedTab = "for-you" | "local" | "global";

// Typed endpoint helpers, ported from apps/frontend/src/lib/api/index.ts. Keep the two in step.
export function createEndpoints(api: ApiClient) {
  return {
    // instance identity + first-run setup wizard
    instance: () => api.get("/instance", c.InstanceInfo),
    // The signed-in user's rich self-view (profile tags + links). Authentication
    // itself is Better Auth ($lib/auth-client); this is the app profile payload.
    me: () => api.get("/me", c.MeResponse),

    // writer dashboard (own analytics) + moderator instance settings
    dashboard: (days?: number) => api.get(`/dashboard${days ? `?days=${days}` : ""}`, c.DashboardSummary),
    // admin moderation
    adminUsers: (
      q?: string,
      filters?: { suspended?: boolean; admin?: boolean; verified?: boolean },
      page?: { cursor?: string | null; limit?: number },
      sort?: "newest" | "oldest" | "username",
    ) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filters?.suspended !== undefined) params.set("suspended", String(filters.suspended));
      if (filters?.admin !== undefined) params.set("admin", String(filters.admin));
      if (filters?.verified !== undefined) params.set("verified", String(filters.verified));
      if (sort && sort !== "newest") params.set("sort", sort);
      if (page?.cursor) params.set("cursor", page.cursor);
      if (page?.limit) params.set("limit", String(page.limit));
      const qs = params.toString();
      return api.get(`/admin/users${qs ? `?${qs}` : ""}`, c.AdminUsers);
    },
    suspendUser: (id: string, suspend: boolean, notify = false) =>
      api.post(`/admin/users/${id}/suspend`, c.Ok, { suspend, notify }),
    // Delete a local account. GitHub-style: the exact username plus the acting
    // admin's own password travel with the request — the server re-verifies both.
    // `notify` mails the account; silence is the default.
    deleteUser: (id: string, body: { username: string; password: string; notify?: boolean }) =>
      api.post(`/admin/users/${id}/delete`, c.Ok, body),
    // Restore a deleted account within its retention window.
    restoreUser: (id: string, notify = false) => api.post(`/admin/users/${id}/restore`, c.Ok, { notify }),
    // Full detail for one account: counts, latest posts and reports against it.
    adminUserDetail: (id: string) => api.get(`/admin/users/${id}`, c.AdminUserDetail),
    // Edit another account's profile + login email. Every field optional; only
    // the keys present are patched. Changing the login email stores it
    // unverified, sends a verification link to the new address and a security
    // notice to the previous one.
    updateUserAsAdmin: (
      id: string,
      body: {
        displayName?: string;
        bio?: string;
        publicEmail?: string;
        customSection?: string;
        tags?: string[];
        links?: { platform: string; url: string; label: string }[];
        email?: string;
      },
    ) => api.patch(`/admin/users/${id}`, c.AdminUserResponse, body),
    // Replace another account's avatar (moderator override for an abusive
    // photo), or clear it back to initials.
    uploadUserAvatarAsAdmin: (id: string, body: BodyInit, contentType: string) =>
      api.postRaw(`/admin/users/${id}/avatar`, c.AdminUserResponse, body, contentType),
    removeUserAvatarAsAdmin: (id: string) => api.del(`/admin/users/${id}/avatar`, c.AdminUserResponse),
    // Resend the verification email, or manually mark the address verified.
    resendVerification: (id: string) => api.post(`/admin/users/${id}/verification-email`, c.Ok, {}),
    verifyEmail: (id: string) => api.post(`/admin/users/${id}/verify`, c.Ok, {}),
    // Grant or revoke the admin role. The acting admin's own password travels
    // with the request — the server re-verifies it. `notify` mails the account.
    setUserRole: (id: string, body: { makeAdmin: boolean; password: string; notify?: boolean }) =>
      api.post(`/admin/users/${id}/role`, c.Ok, body),
    // Grant or revoke the moderator role. Same password re-verification;
    // admin-only. `notify` mails the account.
    setUserModeratorRole: (id: string, body: { makeModerator: boolean; password: string; notify?: boolean }) =>
      api.post(`/admin/users/${id}/moderator-role`, c.Ok, body),
    // Recently deleted accounts awaiting restore or expiry, newest deletion
    // first. Optional handle / name / email filter, keyset-paginated like
    // the live table.
    deletedUsers: (cursor?: string | null, limit?: number, q?: string) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (cursor) params.set("cursor", cursor);
      if (limit) params.set("limit", String(limit));
      const qs = params.toString();
      return api.get(`/admin/users/deleted${qs ? `?${qs}` : ""}`, c.DeletedUsers);
    },
    // Permanently erase a deleted account before its window ends.
    purgeDeletedUser: (id: string) => api.del(`/admin/users/deleted/${id}`, c.Ok),
    adminRemovePost: (id: string, notify = false) => api.del(`/admin/posts/${id}${notify ? "?notify=true" : ""}`, c.Ok),
    adminMarkPostAiAssisted: (id: string) => api.post(`/admin/posts/${id}/ai-assisted`, c.AiAssistedState),
    adminRemovePostAiAssisted: (id: string) => api.del(`/admin/posts/${id}/ai-assisted`, c.AiAssistedState),
    adminReports: (status?: "open" | "resolved") =>
      api.get(`/admin/reports${status ? `?status=${status}` : ""}`, c.AdminReports),
    resolveReport: (id: string, resolution?: string) => api.post(`/admin/reports/${id}/resolve`, c.Ok, { resolution }),
    // user-facing report (flag a post or account)
    report: (subjectType: "post" | "user", subjectId: string, reason?: string) =>
      api.post("/reports", c.Ok, { subjectType, subjectId, reason }),

    // notifications
    notifications: (cursor?: string | null) =>
      api.get(`/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.NotificationPage),
    unreadNotificationCount: () => api.get("/notifications/unread-count", c.UnreadCount),
    markAllNotificationsRead: () => api.post("/notifications/read", c.Ok),
    markNotificationRead: (id: string) => api.post(`/notifications/${id}/read`, c.Ok),

    // search — `tag` and `author` narrow only the posts side (see backend routes/search.ts)
    search: (
      query: string,
      scopeOrOpts?:
        | "posts"
        | "people"
        | "tags"
        | { scope?: "posts" | "people" | "tags"; tag?: string; author?: string },
    ) => {
      const opts = typeof scopeOrOpts === "string" ? { scope: scopeOrOpts } : (scopeOrOpts ?? {});
      const params = new URLSearchParams({ q: query });
      if (opts.scope) params.set("scope", opts.scope);
      if (opts.tag) params.set("tag", opts.tag);
      if (opts.author) params.set("author", opts.author);
      return api.get(`/search?${params.toString()}`, c.SearchResults);
    },

    // tags
    tag: (slug: string) => api.get(`/tags/${encodeURIComponent(slug)}`, c.TagDetail),
    tagPosts: (slug: string, cursor?: string | null) =>
      api.get(
        `/tags/${encodeURIComponent(slug)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        c.PostPage,
      ),
    followTag: (slug: string) => api.post(`/tags/${encodeURIComponent(slug)}/follow`, c.Ok),
    unfollowTag: (slug: string) => api.del(`/tags/${encodeURIComponent(slug)}/follow`, c.Ok),
    trendingTags: () => api.get("/tags", c.TagList),
    followedTags: () => api.get("/tags/following", c.TagList),
    suggestTags: (q: string) => api.get(`/tags/suggest?q=${encodeURIComponent(q)}`, c.TagList),
    searchTags: (q: string) => api.get(`/tags/search?q=${encodeURIComponent(q)}`, c.TagList),
    // publishing tokens for the content webhook (Settings -> Integrations).
    // `createWebhookToken` returns the plaintext token once and never again.
    webhookTokens: () => api.get("/webhooks/tokens", c.WebhookTokens),
    // Better Auth's own routes; the browser's auth client covers everything else.
    createWebhookToken: (label: string) => api.post("/webhooks/tokens", c.MintedWebhookToken, { label }),
    connectedApps: () => api.get("/oauth/connections", c.ConnectedApps),
    revokeConnectedApp: (id: string) => api.del(`/oauth/connections/${encodeURIComponent(id)}`, c.Ok),
    revokeWebhookToken: (id: string) => api.del(`/webhooks/tokens/${encodeURIComponent(id)}`, c.Ok),

    // feed + posts
    feed: (cursor?: string | null) =>
      api.get(`/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.PostPage),
    globalTimeline: (cursor?: string | null, langFilter?: LangFilter | null) =>
      api.get(`/posts${timelineQuery(cursor, langFilter)}`, c.PostPage),
    localTimeline: (cursor?: string | null, langFilter?: LangFilter | null) =>
      api.get(`/posts${timelineQuery(cursor, langFilter, "local")}`, c.PostPage),
    randomPost: (scope: FeedTab, langFilter?: LangFilter | null) =>
      api.get(`/posts/random${timelineQuery(null, langFilter, scope)}`, c.RandomPostResponse),
    trendingPosts: () => api.get("/posts/trending", c.PostItems),
    post: (id: string) => api.get(`/posts/${id}`, c.PostResponse),
    // A post by its permalink. The backend resolves the author's live slug, a
    // slug the post has been moved off, or a trailing short id from a
    // pre-slug link — so every permalink ever issued arrives here.
    postBySlug: (username: string, slug: string) =>
      api.get(`/posts/by/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`, c.PostResponse),
    drafts: (cursor?: string | null) =>
      api.get(`/posts/drafts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.PostPage),
    // The author's own posts in one state — the three tabs of /posts/manage.
    // Scheduled posts come back soonest-first; the other two newest-first.
    ownPosts: (status: OwnPostStatus, cursor?: string | null) =>
      api.get(`/posts/mine?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, c.PostPage),
    ownPostCounts: () => api.get("/posts/mine/counts", c.OwnPostCounts),
    createPost: (body: {
      title?: string;
      contentHtml: string;
      contentJson?: unknown;
      aiAssisted?: boolean;
      status?: OwnPostStatus;
      // ISO instant, required by (and only by) `status: "scheduled"`.
      publishAt?: string | null;
      language?: string | null;
      summary?: string | null;
      coverUrl?: string | null;
      coverCredit?: CoverCredit | null;
      tags?: string[];
    }) => api.post("/posts", c.SavedPostResponse, body),
    updatePost: (
      id: string,
      body: {
        title?: string;
        contentHtml?: string;
        contentJson?: unknown;
        aiAssisted?: boolean;
        // Omitting this leaves the post in the state it is already in, which is
        // what makes the composer's autosave safe on a scheduled post.
        status?: OwnPostStatus;
        publishAt?: string | null;
        language?: string | null;
        summary?: string | null;
        coverUrl?: string | null;
        coverCredit?: CoverCredit | null;
        tags?: string[];
      },
      // `slug` comes back because a retitle changes it, and the editor has to
      // navigate to the post's new address.
    ) => api.patch(`/posts/${id}`, c.SavedPostResponse, body),
    deletePost: (id: string, notify = false) => api.del(`/posts/${id}${notify ? "?notify=true" : ""}`, c.Ok),
    // Posts to read next, shown under an article (see relatedPosts service).
    relatedPosts: (id: string) => api.get(`/posts/${id}/related`, c.PostItems),

    // likes + recommends ("reposts", federate as ActivityPub Announce) + comments
    likePost: (id: string) => api.post(`/posts/${id}/like`, c.LikeState),
    unlikePost: (id: string) => api.del(`/posts/${id}/like`, c.LikeState),
    recommendPost: (id: string) => api.post(`/posts/${id}/recommend`, c.RecommendState),
    unrecommendPost: (id: string) => api.del(`/posts/${id}/recommend`, c.RecommendState),
    comments: (id: string, cursor?: string | null) =>
      api.get(`/posts/${id}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.CommentPage),
    createComment: (id: string, content: string, parentId?: string | null) =>
      api.post(`/posts/${id}/comments`, c.CommentResponse, { content, parentId }),
    editComment: (postId: string, commentId: string, content: string) =>
      api.patch(`/posts/${postId}/comments/${commentId}`, c.EditedCommentResponse, { content }),
    deleteComment: (postId: string, commentId: string) => api.del(`/posts/${postId}/comments/${commentId}`, c.Ok),
    likeComment: (postId: string, commentId: string) =>
      api.post(`/posts/${postId}/comments/${commentId}/like`, c.LikeState),
    unlikeComment: (postId: string, commentId: string) =>
      api.del(`/posts/${postId}/comments/${commentId}/like`, c.LikeState),

    // reading lists
    myLists: () => api.get("/lists", c.ReadingLists),
    userLists: (username: string) => api.get(`/lists/user/${encodeURIComponent(username)}`, c.ReadingLists),
    readLater: () => api.get("/lists/read-later", c.ReadingListResponse),
    list: (id: string) => api.get(`/lists/${id}`, c.ReadingListDetail),
    listItems: (id: string, cursor?: string | null) =>
      api.get(`/lists/${id}/items${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.PostPage),
    listsForPost: (postId: string) => api.get(`/lists/for-post/${postId}`, c.ReadingListsForPost),
    createList: (body: { title: string; description?: string; visibility?: "public" | "private" }) =>
      api.post("/lists", c.ReadingListResponse, body),
    updateList: (id: string, body: { title?: string; description?: string; visibility?: "public" | "private" }) =>
      api.patch(`/lists/${id}`, c.ReadingListResponse, body),
    deleteList: (id: string) => api.del(`/lists/${id}`, c.Ok),
    addToList: (id: string, postId: string) => api.post(`/lists/${id}/items`, c.Ok, { postId }),
    removeFromList: (id: string, postId: string) => api.del(`/lists/${id}/items/${postId}`, c.Ok),

    // current user's profile editing
    updateProfile: (body: {
      displayName?: string;
      bio?: string;
      publicEmail?: string;
      customSection?: string;
      tags?: string[];
      links?: { platform: string; url: string; label: string }[];
    }) => api.patch("/users/me", c.UserResponse, body),
    // Renders the profile's custom Markdown section through the same path as
    // saving, so the editor's preview is exactly what will be stored.
    previewCustomSection: (customSection: string) =>
      api.post("/users/me/custom-section/preview", c.CustomSectionPreview, { customSection }),
    // The blob is downscaled/re-encoded client-side (see prepareImage).
    uploadAvatar: (body: BodyInit, contentType: string) =>
      api.postRaw("/users/me/avatar", c.UserResponse, body, contentType),
    removeAvatar: () => api.del("/users/me/avatar", c.UserResponse),
    // Post-body image upload. The blob is already resized/compressed client-side.
    uploadImage: (body: BodyInit, contentType: string) => api.postRaw("/uploads", c.UploadedImage, body, contentType),

    // Free-photo search for the banner picker. `photoProviders` says which
    // tabs to offer — never empty, since Openverse needs no configuration.
    photoProviders: () => api.get("/photos/providers", c.PhotoProviders),
    searchPhotos: (provider: PhotoProvider, q: string, page = 1) =>
      api.get(`/photos/search?provider=${provider}&q=${encodeURIComponent(q)}&page=${page}`, c.StockPhotos),
    // Tells a provider one of its photos was used — required by Unsplash's API
    // terms so a photographer's download count reflects reality.
    recordPhotoUse: (provider: PhotoProvider, token: string) => api.post("/photos/use", c.Ok, { provider, token }),

    // users + follows
    suggestedUsers: () => api.get("/users/suggested", c.SuggestedUsers),
    profile: (username: string) => api.get(`/users/${username}`, c.Profile),
    userPosts: (username: string, cursor?: string | null) =>
      api.get(`/users/${username}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.PostPage),
    // A profile's "Recommendations" tab: posts they've recommended ("reposted").
    userRecommendations: (username: string, cursor?: string | null) =>
      api.get(`/users/${username}/recommendations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, c.PostPage),
    follow: (username: string) => api.post(`/users/${username}/follow`, c.FollowResponse),
    unfollow: (username: string) => api.del(`/users/${username}/follow`, c.Ok),

    // private-account controls: privacy toggle + the follow-request inbox
    setPrivacy: (isPrivate: boolean) => api.patch("/users/me/privacy", c.UserResponse, { isPrivate }),
    setShowAiAssistedPosts: (showAiAssistedPosts: boolean) =>
      api.patch("/users/me/preferences", c.PreferencesResponse, { showAiAssistedPosts }),
    followRequests: () => api.get("/users/me/follow-requests", c.FollowRequests),
    approveFollowRequest: (id: string) => api.post(`/users/me/follow-requests/${id}/approve`, c.Ok),
    rejectFollowRequest: (id: string) => api.post(`/users/me/follow-requests/${id}/reject`, c.Ok),

    // mute / block local users (auth required)
    mute: (username: string) => api.post(`/users/${username}/mute`, c.Ok),
    unmute: (username: string) => api.del(`/users/${username}/mute`, c.Ok),
    block: (username: string) => api.post(`/users/${username}/block`, c.Ok),
    unblock: (username: string) => api.del(`/users/${username}/block`, c.Ok),

    // a profile's public follower / following lists
    userFollowers: (username: string) => api.get(`/users/${username}/followers`, c.RelationItems),
    userFollowing: (username: string) => api.get(`/users/${username}/following`, c.RelationItems),

    // remove one of your own followers (Instagram/Mastodon "Remove follower").
    // `identifier` is a local username or a remote user@host handle.
    removeFollower: (identifier: string) => api.del(`/users/me/followers/${encodeURIComponent(identifier)}`, c.Ok),

    // muted / blocked lists for the signed-in user (Settings → Connections)
    muted: () => api.get("/users/me/muted", c.RelationItems),
    blocked: () => api.get("/users/me/blocked", c.RelationItems),

    // remote (federated) profiles + their posts, browsed read-only
    remoteProfile: (handle: string) => api.get(`/remote/users/${encodeURIComponent(handle)}`, c.RemoteProfile),
    remoteUserPosts: (handle: string, cursor?: string | null) =>
      api.get(
        `/remote/users/${encodeURIComponent(handle)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        c.PostPage,
      ),
    remoteUserRecommendations: (handle: string, cursor?: string | null) =>
      api.get(
        `/remote/users/${encodeURIComponent(handle)}/recommendations${
          cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
        }`,
        c.PostPage,
      ),
    remoteFollow: (handle: string) => api.post(`/remote/users/${encodeURIComponent(handle)}/follow`, c.Ok),
    remoteUnfollow: (handle: string) => api.del(`/remote/users/${encodeURIComponent(handle)}/follow`, c.Ok),
    remoteMute: (handle: string) => api.post(`/remote/users/${encodeURIComponent(handle)}/mute`, c.Ok),
    remoteUnmute: (handle: string) => api.del(`/remote/users/${encodeURIComponent(handle)}/mute`, c.Ok),
    remoteBlock: (handle: string) => api.post(`/remote/users/${encodeURIComponent(handle)}/block`, c.Ok),
    remoteUnblock: (handle: string) => api.del(`/remote/users/${encodeURIComponent(handle)}/block`, c.Ok),
  };
}
