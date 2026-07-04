// SPDX-License-Identifier: AGPL-3.0-or-later
import { makeApi } from "./client";
import type {
  AdminInstance,
  AdminUser,
  BlockedDomain,
  Comment,
  DashboardSummary,
  DkimGenerateResult,
  EmailDnsResult,
  EmailInput,
  EmailSettings,
  InstanceInfo,
  InstanceSettings,
  Page,
  Post,
  Profile,
  ReadingList,
  ReadingListDetail,
  RelationActor,
  RemoteProfile,
  Report,
  SearchResults,
  SuggestedUser,
  TagDetail,
  TagWithCount,
  User,
} from "$lib/types";

type LikeState = { likeCount: number; liked: boolean };

export { ApiError } from "./client";

// Typed endpoint helpers. Pass a `fetch` from a load function for SSR; omit it
// for browser-side calls.

export function endpoints(fetchFn?: typeof globalThis.fetch) {
  const api = makeApi(fetchFn);
  return {
    // instance identity + first-run setup wizard
    instance: () => api.get<InstanceInfo>("/instance"),
    completeSetup: (
      body: {
        appName: string;
        appDomain?: string;
        email?: EmailInput;
        admin: { username: string; email: string; password: string; displayName?: string };
      },
    ) => api.post<{ user: User }>("/setup", body),
    // Send a wizard test email with not-yet-saved details (open pre-setup).
    testSetupEmail: (body: { to: string; email?: EmailInput }) =>
      api.post<{ ok: true }>("/setup/test-email", body),

    // auth
    me: () => api.get<{ user: User | null }>("/auth/me"),
    register: (body: { username: string; email: string; password: string; displayName?: string }) =>
      api.post<{ user: User }>("/auth/register", body),
    login: (body: { identifier: string; password: string }) =>
      api.post<{ user: User }>("/auth/login", body),
    logout: () => api.post<{ ok: true }>("/auth/logout"),
    forgotPassword: (identifier: string) =>
      api.post<{ ok: true }>("/auth/password/forgot", { identifier }),
    resetPassword: (token: string, password: string) =>
      api.post<{ ok: true }>("/auth/password/reset", { token, password }),
    verifyEmail: (token: string) => api.post<{ ok: true }>("/auth/email/verify", { token }),
    resendVerification: (email: string) =>
      api.post<{ ok: true }>("/auth/email/resend", { email }),
    changePassword: (currentPassword: string, newPassword: string) =>
      api.post<{ ok: true }>("/auth/password/change", { currentPassword, newPassword }),
    deleteAccount: (password: string) => api.del<{ ok: true }>("/auth/me", { password }),

    // writer dashboard (own analytics) + moderator instance settings
    dashboard: (days?: number) =>
      api.get<DashboardSummary>(`/dashboard${days ? `?days=${days}` : ""}`),
    adminSettings: () => api.get<InstanceSettings>("/admin/settings"),
    setAnalytics: (onInstanceViews: boolean) =>
      api.put<InstanceSettings>("/admin/settings/analytics", { onInstanceViews }),

    // admin instance identity (name + domain; federation shown read-only)
    adminInstance: () => api.get<AdminInstance>("/admin/instance"),
    setAdminInstance: (body: { appName?: string; appDomain?: string }) =>
      api.put<AdminInstance>("/admin/instance", body),

    // admin email settings (runtime-configurable delivery)
    adminEmail: () => api.get<EmailSettings>("/admin/email"),
    setAdminEmail: (body: EmailInput) => api.put<EmailSettings>("/admin/email", body),
    testAdminEmail: (to: string) => api.post<{ ok: true }>("/admin/email/test", { to }),
    // Path B self-host: generate DKIM keys + get DNS records; live-verify them.
    generateDkim: (domain: string) =>
      api.post<DkimGenerateResult>("/admin/email/dkim", { domain }),
    checkEmailDns: () => api.get<EmailDnsResult>("/admin/email/dns"),
    checkPort25: () => api.get<{ ok: boolean; detail: string }>("/admin/email/port25"),

    // admin moderation
    adminUsers: (q?: string) =>
      api.get<{ users: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    suspendUser: (id: string, suspend: boolean) =>
      api.post<{ ok: true }>(`/admin/users/${id}/suspend`, { suspend }),
    adminRemovePost: (id: string) => api.del<{ ok: true }>(`/admin/posts/${id}`),
    adminReports: (status?: "open" | "resolved") =>
      api.get<{ reports: Report[]; openCount: number }>(
        `/admin/reports${status ? `?status=${status}` : ""}`,
      ),
    resolveReport: (id: string, resolution?: string) =>
      api.post<{ ok: true }>(`/admin/reports/${id}/resolve`, { resolution }),
    blockedDomains: () => api.get<{ domains: BlockedDomain[] }>("/admin/domains"),
    blockDomain: (domain: string, reason?: string) =>
      api.post<{ domain: string; purged: number }>("/admin/domains", { domain, reason }),
    unblockDomain: (domain: string) =>
      api.del<{ ok: true }>(`/admin/domains/${encodeURIComponent(domain)}`),

    // user-facing report (flag a post or account)
    report: (subjectType: "post" | "user", subjectId: string, reason?: string) =>
      api.post<{ ok: true }>("/reports", { subjectType, subjectId, reason }),

    // search
    search: (query: string, scope?: "posts" | "people" | "tags") =>
      api.get<SearchResults>(
        `/search?q=${encodeURIComponent(query)}${scope ? `&scope=${scope}` : ""}`,
      ),

    // tags
    tag: (slug: string) => api.get<TagDetail>(`/tags/${encodeURIComponent(slug)}`),
    tagPosts: (slug: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/tags/${encodeURIComponent(slug)}/posts${
          cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
        }`,
      ),
    followTag: (slug: string) => api.post<{ ok: true }>(`/tags/${encodeURIComponent(slug)}/follow`),
    unfollowTag: (slug: string) =>
      api.del<{ ok: true }>(`/tags/${encodeURIComponent(slug)}/follow`),
    trendingTags: () => api.get<{ tags: TagWithCount[] }>("/tags"),
    followedTags: () => api.get<{ tags: TagWithCount[] }>("/tags/following"),

    // feed + posts
    feed: (cursor?: string | null) =>
      api.get<Page<Post>>(`/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    globalTimeline: (cursor?: string | null) =>
      api.get<Page<Post>>(`/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    localTimeline: (cursor?: string | null) =>
      api.get<Page<Post>>(`/posts?scope=local${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    trendingPosts: () => api.get<{ items: Post[] }>("/posts/trending"),
    post: (id: string) => api.get<{ post: Post }>(`/posts/${id}`),
    drafts: (cursor?: string | null) =>
      api.get<Page<Post>>(`/posts/drafts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    createPost: (
      body: { title?: string; contentHtml: string; contentJson?: unknown; status?: "draft" | "published"; tags?: string[] },
    ) => api.post<{ post: { id: string } }>("/posts", body),
    updatePost: (
      id: string,
      body: { title?: string; contentHtml?: string; contentJson?: unknown; status?: "draft" | "published"; tags?: string[] },
    ) => api.patch<{ post: { id: string } }>(`/posts/${id}`, body),
    deletePost: (id: string) => api.del<{ ok: true }>(`/posts/${id}`),

    // likes + comments
    likePost: (id: string) => api.post<LikeState>(`/posts/${id}/like`),
    unlikePost: (id: string) => api.del<LikeState>(`/posts/${id}/like`),
    comments: (id: string, cursor?: string | null) =>
      api.get<Page<Comment>>(
        `/posts/${id}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    createComment: (id: string, content: string, parentId?: string | null) =>
      api.post<{ comment: Comment }>(`/posts/${id}/comments`, { content, parentId }),
    editComment: (postId: string, commentId: string, content: string) =>
      api.patch<{ comment: { id: string; content: string } }>(
        `/posts/${postId}/comments/${commentId}`,
        { content },
      ),
    deleteComment: (postId: string, commentId: string) =>
      api.del<{ ok: true }>(`/posts/${postId}/comments/${commentId}`),
    likeComment: (postId: string, commentId: string) =>
      api.post<LikeState>(`/posts/${postId}/comments/${commentId}/like`),
    unlikeComment: (postId: string, commentId: string) =>
      api.del<LikeState>(`/posts/${postId}/comments/${commentId}/like`),

    // reading lists
    myLists: () => api.get<{ lists: ReadingList[] }>("/lists"),
    userLists: (username: string) =>
      api.get<{ lists: ReadingList[] }>(`/lists/user/${encodeURIComponent(username)}`),
    readLater: () => api.get<{ list: ReadingList }>("/lists/read-later"),
    list: (id: string) => api.get<ReadingListDetail>(`/lists/${id}`),
    listItems: (id: string, cursor?: string | null) =>
      api.get<Page<Post>>(`/lists/${id}/items${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    listsForPost: (postId: string) => api.get<{ lists: ReadingList[] }>(`/lists/for-post/${postId}`),
    createList: (body: { title: string; description?: string; visibility?: "public" | "private" }) =>
      api.post<{ list: ReadingList }>("/lists", body),
    updateList: (
      id: string,
      body: { title?: string; description?: string; visibility?: "public" | "private" },
    ) => api.patch<{ list: ReadingList }>(`/lists/${id}`, body),
    deleteList: (id: string) => api.del<{ ok: true }>(`/lists/${id}`),
    addToList: (id: string, postId: string) =>
      api.post<{ ok: true }>(`/lists/${id}/items`, { postId }),
    removeFromList: (id: string, postId: string) =>
      api.del<{ ok: true }>(`/lists/${id}/items/${postId}`),

    // current user's profile editing
    updateProfile: (
      body: {
        displayName?: string;
        bio?: string;
        publicEmail?: string;
        tags?: string[];
        links?: { platform: string; url: string; label: string }[];
      },
    ) =>
      api.patch<{ user: User }>("/users/me", body),
    // The blob is downscaled/re-encoded client-side (see prepareImage).
    uploadAvatar: (blob: Blob, contentType: string) =>
      api.postRaw<{ user: User }>("/users/me/avatar", blob, contentType),
    removeAvatar: () => api.del<{ user: User }>("/users/me/avatar"),
    // Post-body image upload. The blob is already resized/compressed client-side.
    uploadImage: (blob: Blob, contentType: string) =>
      api.postRaw<{ url: string }>("/uploads", blob, contentType),

    // users + follows
    suggestedUsers: () => api.get<{ items: SuggestedUser[] }>("/users/suggested"),
    profile: (username: string) => api.get<Profile>(`/users/${username}`),
    userPosts: (username: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/users/${username}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    follow: (username: string) => api.post(`/users/${username}/follow`),
    unfollow: (username: string) => api.del(`/users/${username}/follow`),

    // mute / block local users (auth required)
    mute: (username: string) => api.post(`/users/${username}/mute`),
    unmute: (username: string) => api.del(`/users/${username}/mute`),
    block: (username: string) => api.post(`/users/${username}/block`),
    unblock: (username: string) => api.del(`/users/${username}/block`),

    // a profile's public follower / following lists
    userFollowers: (username: string) =>
      api.get<{ items: RelationActor[] }>(`/users/${username}/followers`),
    userFollowing: (username: string) =>
      api.get<{ items: RelationActor[] }>(`/users/${username}/following`),

    // muted / blocked lists for the signed-in user (Settings → Connections)
    muted: () => api.get<{ items: RelationActor[] }>("/users/me/muted"),
    blocked: () => api.get<{ items: RelationActor[] }>("/users/me/blocked"),

    // remote (federated) profiles + their posts, browsed read-only
    remoteProfile: (handle: string) =>
      api.get<RemoteProfile>(`/remote/users/${encodeURIComponent(handle)}`),
    remoteUserPosts: (handle: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/remote/users/${encodeURIComponent(handle)}/posts${
          cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
        }`,
      ),
    remoteFollow: (handle: string) =>
      api.post(`/remote/users/${encodeURIComponent(handle)}/follow`),
    remoteUnfollow: (handle: string) =>
      api.del(`/remote/users/${encodeURIComponent(handle)}/follow`),
    remoteMute: (handle: string) =>
      api.post(`/remote/users/${encodeURIComponent(handle)}/mute`),
    remoteUnmute: (handle: string) =>
      api.del(`/remote/users/${encodeURIComponent(handle)}/mute`),
    remoteBlock: (handle: string) =>
      api.post(`/remote/users/${encodeURIComponent(handle)}/block`),
    remoteUnblock: (handle: string) =>
      api.del(`/remote/users/${encodeURIComponent(handle)}/block`),
  };
}