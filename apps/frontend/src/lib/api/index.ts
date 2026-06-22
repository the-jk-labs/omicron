import { makeApi } from "./client";
import type { Comment, Page, Post, Profile, User } from "$lib/types";

type LikeState = { likeCount: number; liked: boolean };

export { ApiError } from "./client";

// Typed endpoint helpers. Pass a `fetch` from a load function for SSR; omit it
// for browser-side calls.

export function endpoints(fetchFn?: typeof globalThis.fetch) {
  const api = makeApi(fetchFn);
  return {
    // auth
    me: () => api.get<{ user: User | null }>("/auth/me"),
    register: (body: { username: string; email: string; password: string; displayName?: string }) =>
      api.post<{ user: User }>("/auth/register", body),
    login: (body: { identifier: string; password: string }) =>
      api.post<{ user: User }>("/auth/login", body),
    logout: () => api.post<{ ok: true }>("/auth/logout"),

    // feed + posts
    feed: (cursor?: string | null) =>
      api.get<Page<Post>>(`/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    globalTimeline: (cursor?: string | null) =>
      api.get<Page<Post>>(`/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),
    localTimeline: (cursor?: string | null) =>
      api.get<Page<Post>>(`/posts?scope=local${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
    post: (id: string) => api.get<{ post: Post }>(`/posts/${id}`),
    createPost: (body: { title?: string; contentHtml: string; contentJson?: unknown }) =>
      api.post<{ post: { id: string } }>("/posts", body),

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

    // current user's profile editing
    updateProfile: (body: { displayName?: string; bio?: string }) =>
      api.patch<{ user: User }>("/users/me", body),
    uploadAvatar: (file: File) =>
      api.postRaw<{ user: User }>("/users/me/avatar", file, file.type),

    // users + follows
    profile: (username: string) => api.get<Profile>(`/users/${username}`),
    userPosts: (username: string, cursor?: string | null) =>
      api.get<Page<Post>>(
        `/users/${username}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
    follow: (username: string) => api.post(`/users/${username}/follow`),
    unfollow: (username: string) => api.del(`/users/${username}/follow`),
  };
}
