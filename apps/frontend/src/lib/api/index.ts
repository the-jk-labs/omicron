import { makeApi } from "./client";
import type { Page, Post, Profile, User } from "$lib/types";

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
