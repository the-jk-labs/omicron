import type {
  AdminInstance,
  AdminUser,
  BlockedDomain,
  Comment,
  CoverCredit,
  DashboardSummary,
  DkimGenerateResult,
  EmailDnsResult,
  EmailInput,
  EmailSettings,
  FollowRequest,
  InstanceInfo,
  InstanceSettings,
  Notification,
  OwnPostStatus,
  Page,
  Post,
  Profile,
  ReadingList,
  ReadingListDetail,
  RelationActor,
  RemoteProfile,
  Report,
  SearchResults,
  SecuritySettings,
  SeoSettings,
  SitemapContents,
  SitemapEntry,
  SuggestedUser,
  TagDetail,
  TagWithCount,
  PhotoProvider,
  StockPhoto,
  User,
  WebhookToken,
} from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { makeApi } from "./client";

type LikeState = { likeCount: number; liked: boolean };
type RecommendState = { recommendCount: number; recommended: boolean };

// The reader's feed language filter, forwarded to the timeline endpoints as
// query params (see prefs.svelte.ts `feedLangQuery`).
export type LangFilter = { langMode: "show" | "hide"; langs: string };

// Builds the `?scope=&cursor=&langMode=&langs=` query string for the public
// timelines, omitting whatever isn't set.
function timelineQuery(cursor?: string | null, langFilter?: LangFilter | null, scope?: "local"): string {
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

export { ApiError } from "./client";

// Typed endpoint helpers. Pass a `fetch` from a load function for SSR; omit it
// for browser-side calls.

export function endpoints(fetchFn?: typeof globalThis.fetch) {
  const api = makeApi(fetchFn);
  return {
    // instance identity + first-run setup wizard
    instance: () => api.get<InstanceInfo>("/instance"),
    completeSetup: (body: {
      appName: string;
      appDomain?: string;
      email?: EmailInput;
      admin: { username: string; email: string; password: string; displayName?: string };
    }) => api.post<{ user: User }>("/setup", body),
    // Send a wizard test email with not-yet-saved details (open pre-setup).
    testSetupEmail: (body: { to: string; email?: EmailInput }) => api.post<{ ok: true }>("/setup/test-email", body),

    // The signed-in user's rich self-view (profile tags + links). Authentication
    // itself is Better Auth ($lib/auth-client); this is the app profile payload.
    me: () => api.get<{ user: User | null }>("/me"),

    // writer dashboard (own analytics) + moderator instance settings
    dashboard: (days?: number) => api.get<DashboardSummary>(`/dashboard${days ? `?days=${days}` : ""}`),
    adminSettings: () => api.get<InstanceSettings>("/admin/settings"),
    setAnalytics: (onInstanceViews: boolean) =>
      api.put<InstanceSettings>("/admin/settings/analytics", { onInstanceViews }),

    // admin instance identity (name + domain + federation toggle, restart-applied)
    adminInstance: () => api.get<AdminInstance>("/admin/instance"),
    setAdminInstance: (body: {
      appName?: string;
      appDomain?: string;
      federationEnabled?: boolean;
      bannerText?: string;
    }) => api.put<AdminInstance>("/admin/instance", body),
    // Rotate the auto-managed session secret (takes effect on restart, signs out).
    rotateSessionSecret: () => api.post<{ ok: true }>("/admin/instance/rotate-secret", {}),
    // Signed-out visitor card banner image: upload a new one, or revert to default.
    uploadInstanceBanner: (blob: Blob, contentType: string) =>
      api.postRaw<AdminInstance>("/admin/instance/banner", blob, contentType),
    removeInstanceBanner: () => api.del<AdminInstance>("/admin/instance/banner"),

    // admin security: the AI-scraper shield (Anubis), toggled live via Caddy.
    adminSecurity: () => api.get<SecuritySettings>("/admin/security"),
    setAnubisProtection: (enabled: boolean) =>
      api.put<SecuritySettings>("/admin/security/anubis", { anubisProtection: enabled }),

    // discoverability / SEO: public read (layout, robots.txt, sitemap.xml) + the
    // moderator-only write side.
    seo: () => api.get<SeoSettings>("/seo"),
    // Yes/no check backing the IndexNow key file; never returns the key.
    verifyIndexNowKey: (key: string) => api.get<{ ok: boolean }>(`/seo/indexnow-key/${encodeURIComponent(key)}`),
    sitemapEntries: () => api.get<SitemapContents>("/seo/sitemap-entries"),
    sitemapPosts: (page: number) => api.get<SitemapEntry[]>(`/seo/sitemap-posts?page=${page}`),
    adminSeo: () => api.get<SeoSettings>("/admin/seo"),
    setAdminSeo: (body: Partial<SeoSettings>) => api.put<SeoSettings>("/admin/seo", body),
    // The Unsplash access key. Never read back — only whether one is set.
    adminUnsplash: () => api.get<{ configured: boolean }>("/admin/unsplash"),
    setAdminUnsplash: (accessKey: string | null) => api.put<{ configured: boolean }>("/admin/unsplash", { accessKey }),

    // admin email settings (runtime-configurable delivery)
    adminEmail: () => api.get<EmailSettings>("/admin/email"),
    setAdminEmail: (body: EmailInput) => api.put<EmailSettings>("/admin/email", body),
    testAdminEmail: (to: string) => api.post<{ ok: true }>("/admin/email/test", { to }),
    // Path B self-host: generate DKIM keys + get DNS records; live-verify them.
    generateDkim: (domain: string) => api.post<DkimGenerateResult>("/admin/email/dkim", { domain }),
    checkEmailDns: () => api.get<EmailDnsResult>("/admin/email/dns"),
    checkPort25: () => api.get<{ ok: boolean; detail: string }>("/admin/email/port25"),

    // admin moderation
    adminUsers: (q?: string) =>
      api.get<{ users: AdminUser[] }>(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    suspendUser: (id: string, suspend: boolean) => api.post<{ ok: true }>(`/admin/users/${id}/suspend`, { suspend }),
    adminRemovePost: (id: string) => api.del<{ ok: true }>(`/admin/posts/${id}`),
    adminReports: (status?: "open" | "resolved") =>
      api.get<{ reports: Report[]; openCount: number }>(`/admin/reports${status ? `?status=${status}` : ""}`),
    resolveReport: (id: string, resolution?: string) =>
      api.post<{ ok: true }>(`/admin/reports/${id}/resolve`, { resolution }),
    blockedDomains: () => api.get<{ domains: BlockedDomain[] }>("/admin/domains"),
    blockDomain: (domain: string, reason?: string) =>
      api.post<{ domain: string; purged: number }>("/admin/domains", { domain, reason }),
    unblockDomain: (domain: string) => api.del<{ ok: true }>(`/admin/domains/${encodeURIComponent(domain)}`),

    // user-facing report (flag a post or account)
    report: (subjectType: "post" | "user", subjectId: string, reason?: string) =>
      api.post<{ ok: true }>("/reports", { subjectType, subjectId, reason }),

    // notifications
    notifications: (cursor?: string | null) =>
      api.get<Page<Notification>>(`/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    unreadNotificationCount: () => api.get<{ count: number }>("/notifications/unread-count"),
    markAllNotificationsRead: () => api.post<{ ok: true }>("/notifications/read"),
    markNotificationRead: (id: string) => api.post<{ ok: true }>(`/notifications/${id}/read`),

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
      return api.get<SearchResults>(`/search?${params.toString()}`);
    },

    // tags
    tag: (slug: string) => api.get<TagDetail>(`/tags/${encodeURIComponent(slug)}`),
    tagPosts: (slug: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/tags/${encodeURIComponent(slug)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    followTag: (slug: string) => api.post<{ ok: true }>(`/tags/${encodeURIComponent(slug)}/follow`),
    unfollowTag: (slug: string) => api.del<{ ok: true }>(`/tags/${encodeURIComponent(slug)}/follow`),
    trendingTags: () => api.get<{ tags: TagWithCount[] }>("/tags"),
    followedTags: () => api.get<{ tags: TagWithCount[] }>("/tags/following"),
    suggestTags: (q: string) => api.get<{ tags: TagWithCount[] }>(`/tags/suggest?q=${encodeURIComponent(q)}`),
    searchTags: (q: string) => api.get<{ tags: TagWithCount[] }>(`/tags/search?q=${encodeURIComponent(q)}`),
    adminTagAliases: () =>
      api.get<{ aliases: { aliasSlug: string; slug: string; name: string }[] }>("/admin/tags/aliases"),
    createTagAlias: (alias: string, target: string) => api.post<{ ok: true }>("/admin/tags/alias", { alias, target }),
    mergeTags: (from: string, to: string) => api.post<{ ok: true }>("/admin/tags/merge", { from, to }),

    // publishing tokens for the content webhook (Settings -> Integrations).
    // `createWebhookToken` returns the plaintext token once and never again.
    webhookTokens: () => api.get<{ tokens: WebhookToken[] }>("/webhooks/tokens"),
    createWebhookToken: (label: string) =>
      api.post<{ token: string; tokenInfo: WebhookToken }>("/webhooks/tokens", { label }),
    revokeWebhookToken: (id: string) => api.del<{ ok: true }>(`/webhooks/tokens/${encodeURIComponent(id)}`),

    // feed + posts
    feed: (cursor?: string | null) =>
      api.get<Page<Post>>(`/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    globalTimeline: (cursor?: string | null, langFilter?: LangFilter | null) =>
      api.get<Page<Post>>(`/posts${timelineQuery(cursor, langFilter)}`),
    localTimeline: (cursor?: string | null, langFilter?: LangFilter | null) =>
      api.get<Page<Post>>(`/posts${timelineQuery(cursor, langFilter, "local")}`),
    trendingPosts: () => api.get<{ items: Post[] }>("/posts/trending"),
    post: (id: string) => api.get<{ post: Post }>(`/posts/${id}`),
    // A post by its permalink. The backend resolves the author's live slug, a
    // slug the post has been moved off, or a trailing short id from a
    // pre-slug link — so every permalink ever issued arrives here.
    postBySlug: (username: string, slug: string) =>
      api.get<{ post: Post }>(`/posts/by/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`),
    drafts: (cursor?: string | null) =>
      api.get<Page<Post>>(`/posts/drafts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    // The author's own posts in one state — the three tabs of /posts/manage.
    // Scheduled posts come back soonest-first; the other two newest-first.
    ownPosts: (status: OwnPostStatus, cursor?: string | null) =>
      api.get<Page<Post>>(`/posts/mine?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    ownPostCounts: () => api.get<Record<OwnPostStatus, number>>("/posts/mine/counts"),
    createPost: (body: {
      title?: string;
      contentHtml: string;
      contentJson?: unknown;
      status?: OwnPostStatus;
      // ISO instant, required by (and only by) `status: "scheduled"`.
      publishAt?: string | null;
      language?: string | null;
      summary?: string | null;
      coverUrl?: string | null;
      coverCredit?: CoverCredit | null;
      tags?: string[];
    }) => api.post<{ post: { id: string; slug: string | null } }>("/posts", body),
    updatePost: (
      id: string,
      body: {
        title?: string;
        contentHtml?: string;
        contentJson?: unknown;
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
    ) => api.patch<{ post: { id: string; slug: string | null } }>(`/posts/${id}`, body),
    deletePost: (id: string) => api.del<{ ok: true }>(`/posts/${id}`),
    // Posts to read next, shown under an article (see relatedPosts service).
    relatedPosts: (id: string) => api.get<{ items: Post[] }>(`/posts/${id}/related`),

    // likes + recommends ("reposts", federate as ActivityPub Announce) + comments
    likePost: (id: string) => api.post<LikeState>(`/posts/${id}/like`),
    unlikePost: (id: string) => api.del<LikeState>(`/posts/${id}/like`),
    recommendPost: (id: string) => api.post<RecommendState>(`/posts/${id}/recommend`),
    unrecommendPost: (id: string) => api.del<RecommendState>(`/posts/${id}/recommend`),
    comments: (id: string, cursor?: string | null) =>
      api.get<Page<Comment>>(`/posts/${id}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    createComment: (id: string, content: string, parentId?: string | null) =>
      api.post<{ comment: Comment }>(`/posts/${id}/comments`, { content, parentId }),
    editComment: (postId: string, commentId: string, content: string) =>
      api.patch<{ comment: { id: string; content: string } }>(`/posts/${postId}/comments/${commentId}`, { content }),
    deleteComment: (postId: string, commentId: string) =>
      api.del<{ ok: true }>(`/posts/${postId}/comments/${commentId}`),
    likeComment: (postId: string, commentId: string) =>
      api.post<LikeState>(`/posts/${postId}/comments/${commentId}/like`),
    unlikeComment: (postId: string, commentId: string) =>
      api.del<LikeState>(`/posts/${postId}/comments/${commentId}/like`),

    // reading lists
    myLists: () => api.get<{ lists: ReadingList[] }>("/lists"),
    userLists: (username: string) => api.get<{ lists: ReadingList[] }>(`/lists/user/${encodeURIComponent(username)}`),
    readLater: () => api.get<{ list: ReadingList }>("/lists/read-later"),
    list: (id: string) => api.get<ReadingListDetail>(`/lists/${id}`),
    listItems: (id: string, cursor?: string | null) =>
      api.get<Page<Post>>(`/lists/${id}/items${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    listsForPost: (postId: string) => api.get<{ lists: ReadingList[] }>(`/lists/for-post/${postId}`),
    createList: (body: { title: string; description?: string; visibility?: "public" | "private" }) =>
      api.post<{ list: ReadingList }>("/lists", body),
    updateList: (id: string, body: { title?: string; description?: string; visibility?: "public" | "private" }) =>
      api.patch<{ list: ReadingList }>(`/lists/${id}`, body),
    deleteList: (id: string) => api.del<{ ok: true }>(`/lists/${id}`),
    addToList: (id: string, postId: string) => api.post<{ ok: true }>(`/lists/${id}/items`, { postId }),
    removeFromList: (id: string, postId: string) => api.del<{ ok: true }>(`/lists/${id}/items/${postId}`),

    // current user's profile editing
    updateProfile: (body: {
      displayName?: string;
      bio?: string;
      publicEmail?: string;
      customSection?: string;
      tags?: string[];
      links?: { platform: string; url: string; label: string }[];
    }) => api.patch<{ user: User }>("/users/me", body),
    // Renders the profile's custom Markdown section through the same path as
    // saving, so the editor's preview is exactly what will be stored.
    previewCustomSection: (customSection: string) =>
      api.post<{ html: string }>("/users/me/custom-section/preview", { customSection }),
    // The blob is downscaled/re-encoded client-side (see prepareImage).
    uploadAvatar: (blob: Blob, contentType: string) =>
      api.postRaw<{ user: User }>("/users/me/avatar", blob, contentType),
    removeAvatar: () => api.del<{ user: User }>("/users/me/avatar"),
    // Post-body image upload. The blob is already resized/compressed client-side.
    uploadImage: (blob: Blob, contentType: string) => api.postRaw<{ url: string }>("/uploads", blob, contentType),

    // Free-photo search for the banner picker. `photoProviders` says which
    // tabs to offer — never empty, since Openverse needs no configuration.
    photoProviders: () => api.get<{ providers: PhotoProvider[] }>("/photos/providers"),
    searchPhotos: (provider: PhotoProvider, q: string, page = 1) =>
      api.get<{ items: StockPhoto[] }>(`/photos/search?provider=${provider}&q=${encodeURIComponent(q)}&page=${page}`),
    // Tells a provider one of its photos was used — required by Unsplash's API
    // terms so a photographer's download count reflects reality.
    recordPhotoUse: (provider: PhotoProvider, token: string) =>
      api.post<{ ok: true }>("/photos/use", { provider, token }),

    // users + follows
    suggestedUsers: () => api.get<{ items: SuggestedUser[] }>("/users/suggested"),
    profile: (username: string) => api.get<Profile>(`/users/${username}`),
    userPosts: (username: string, cursor?: string | null) =>
      api.get<Page<Post>>(`/users/${username}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    // A profile's "Recommendations" tab: posts they've recommended ("reposted").
    userRecommendations: (username: string, cursor?: string | null) =>
      api.get<Page<Post>>(`/users/${username}/recommendations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    follow: (username: string) => api.post<{ ok: true; state: "requested" | "following" }>(`/users/${username}/follow`),
    unfollow: (username: string) => api.del(`/users/${username}/follow`),

    // private-account controls: privacy toggle + the follow-request inbox
    setPrivacy: (isPrivate: boolean) => api.patch<{ user: User }>("/users/me/privacy", { isPrivate }),
    followRequests: () => api.get<{ items: FollowRequest[] }>("/users/me/follow-requests"),
    approveFollowRequest: (id: string) => api.post<{ ok: true }>(`/users/me/follow-requests/${id}/approve`),
    rejectFollowRequest: (id: string) => api.post<{ ok: true }>(`/users/me/follow-requests/${id}/reject`),

    // mute / block local users (auth required)
    mute: (username: string) => api.post(`/users/${username}/mute`),
    unmute: (username: string) => api.del(`/users/${username}/mute`),
    block: (username: string) => api.post(`/users/${username}/block`),
    unblock: (username: string) => api.del(`/users/${username}/block`),

    // a profile's public follower / following lists
    userFollowers: (username: string) => api.get<{ items: RelationActor[] }>(`/users/${username}/followers`),
    userFollowing: (username: string) => api.get<{ items: RelationActor[] }>(`/users/${username}/following`),

    // remove one of your own followers (Instagram/Mastodon "Remove follower").
    // `identifier` is a local username or a remote user@host handle.
    removeFollower: (identifier: string) => api.del(`/users/me/followers/${encodeURIComponent(identifier)}`),

    // muted / blocked lists for the signed-in user (Settings → Connections)
    muted: () => api.get<{ items: RelationActor[] }>("/users/me/muted"),
    blocked: () => api.get<{ items: RelationActor[] }>("/users/me/blocked"),

    // remote (federated) profiles + their posts, browsed read-only
    remoteProfile: (handle: string) => api.get<RemoteProfile>(`/remote/users/${encodeURIComponent(handle)}`),
    remoteUserPosts: (handle: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/remote/users/${encodeURIComponent(handle)}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    remoteUserRecommendations: (handle: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/remote/users/${encodeURIComponent(handle)}/recommendations${
          cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
        }`,
      ),
    remoteFollow: (handle: string) => api.post(`/remote/users/${encodeURIComponent(handle)}/follow`),
    remoteUnfollow: (handle: string) => api.del(`/remote/users/${encodeURIComponent(handle)}/follow`),
    remoteMute: (handle: string) => api.post(`/remote/users/${encodeURIComponent(handle)}/mute`),
    remoteUnmute: (handle: string) => api.del(`/remote/users/${encodeURIComponent(handle)}/mute`),
    remoteBlock: (handle: string) => api.post(`/remote/users/${encodeURIComponent(handle)}/block`),
    remoteUnblock: (handle: string) => api.del(`/remote/users/${encodeURIComponent(handle)}/block`),
  };
}
