import type { OwnPostStatus } from "@omicron/contract";
import type { FeedTab, LangFilter } from "@/lib/api/endpoints";

// One place for every query key. Each cache is already scoped to one instance (see InstanceProvider).
export const queryKeys = {
  me: ["me"] as const,
  instance: ["instance"] as const,

  feed: (tab: FeedTab, langs: LangFilter | null) => ["feed", tab, langs?.langMode ?? "", langs?.langs ?? ""] as const,
  post: (handle: string, slug: string) => ["post", handle, slug] as const,
  postById: (id: string) => ["post-id", id] as const,
  related: (id: string) => ["related", id] as const,
  comments: (postId: string) => ["comments", postId] as const,
  posts: ["post"] as const,

  trending: ["trending"] as const,
  suggestedUsers: ["suggested-users"] as const,
  trendingTags: ["trending-tags"] as const,

  profile: (handle: string) => ["profile", handle] as const,
  profilePosts: (handle: string, tab: "articles" | "recommendations") => ["profile-posts", handle, tab] as const,
  profileLists: (handle: string) => ["profile-lists", handle] as const,
  followers: (handle: string, kind: "followers" | "following") => ["relations", handle, kind] as const,

  tag: (slug: string) => ["tag", slug] as const,
  tagPosts: (slug: string) => ["tag-posts", slug] as const,
  followedTags: ["followed-tags"] as const,
  tagSuggestions: (q: string) => ["tag-suggest", q] as const,

  search: (q: string) => ["search", q] as const,

  notifications: ["notifications"] as const,
  unreadCount: ["notifications", "unread"] as const,
  followRequests: ["follow-requests"] as const,

  lists: ["lists"] as const,
  list: (id: string) => ["list", id] as const,
  listItems: (id: string) => ["list-items", id] as const,
  listsForPost: (postId: string) => ["lists-for-post", postId] as const,

  ownPosts: (status: OwnPostStatus) => ["own-posts", status] as const,
  ownPostCounts: ["own-posts", "counts"] as const,
  dashboard: (days: number) => ["dashboard", days] as const,

  muted: ["muted"] as const,
  blocked: ["blocked"] as const,
  webhookTokens: ["webhook-tokens"] as const,
  sessions: ["sessions"] as const,

  adminReports: (status: "open" | "resolved") => ["admin-reports", status] as const,
  adminUsers: (q: string, filter: string) => ["admin-users", q, filter] as const,
  adminUser: (id: string) => ["admin-user", id] as const,
};
