import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import Discover from "./Discover.svelte";

const post: Post = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Hello world",
  slug: "hello-world",
  contentHtml: "<p>Body</p>",
  remote: false,
  summary: null,
  bannerUrl: null,
  createdAt: "2026-08-20T12:00:00.000Z",
  author: { id: "author-1", username: "alice", displayName: "Alice", avatarUrl: null },
  tags: [],
  likeCount: 1,
  liked: false,
  commentCount: 2,
  recommendCount: 3,
  recommended: false,
  recommendedBy: null,
};

describe("Discover trending counters", () => {
  it("shows like, comment and recommend with the same labelled format as cards", () => {
    render(Discover, { props: { data: { posts: [post], people: [], tags: [] } } });

    // All three counters must be present, each with title + sr-only + aria-hidden,
    // the exact same pattern PostCard uses via ReactionCount. Two counters ("1 2")
    // was the bug — trending must show three ("1 2 3") via the single component.
    const likeSr = screen.getByText("1 like");
    expect(likeSr).toHaveClass("sr-only");
    expect(likeSr.closest('[title="1 like"]')).not.toBeNull();
    expect(likeSr.closest('[title="1 like"]')!.querySelector('[aria-hidden="true"]')).toHaveTextContent("1");

    const commentSr = screen.getByText("2 responses");
    expect(commentSr).toHaveClass("sr-only");
    expect(commentSr.closest('[title="2 responses"]')).not.toBeNull();

    const recSr = screen.getByText("3 recommendations");
    expect(recSr).toHaveClass("sr-only");
    expect(recSr.closest('[title="3 recommendations"]')).not.toBeNull();
    expect(recSr.closest('[title="3 recommendations"]')!.querySelector('[aria-hidden="true"]')).toHaveTextContent("3");
  });

  it("handles singular/plural the same way cards do", () => {
    const solo: Post = { ...post, likeCount: 1, commentCount: 1, recommendCount: 1 };
    const { unmount } = render(Discover, { props: { data: { posts: [solo], people: [], tags: [] } } });
    expect(screen.getByText("1 like")).toBeInTheDocument();
    expect(screen.getByText("1 response")).toBeInTheDocument();
    expect(screen.getByText("1 recommendation")).toBeInTheDocument();
    unmount();

    const zero: Post = { ...post, likeCount: 0, commentCount: 0, recommendCount: 0 };
    render(Discover, { props: { data: { posts: [zero], people: [], tags: [] } } });
    expect(screen.getByText("0 likes")).toBeInTheDocument();
    expect(screen.getByText("0 responses")).toBeInTheDocument();
    expect(screen.getByText("0 recommendations")).toBeInTheDocument();
  });
});
