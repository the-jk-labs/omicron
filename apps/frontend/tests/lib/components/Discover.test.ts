import { page } from "$app/state";
import Discover from "$lib/components/Discover.svelte";
import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

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

describe("Discover sections", () => {
  const person = { id: "u2", username: "bob", displayName: "Bob", avatarUrl: null, remote: false, followerCount: 1 };
  const tag = { slug: "deno", name: "Deno", postCount: 12 };

  it("renders nothing without data, and only the sections that have items", () => {
    const { container, unmount } = render(Discover, { props: { data: null } });
    expect(container.querySelectorAll("section")).toHaveLength(0);
    unmount();
    render(Discover, { props: { data: { posts: [], people: [], tags: [tag] } } });
    expect(screen.getAllByRole("heading").map((h) => h.textContent?.trim())).toEqual(["Topics"]);
  });

  it("numbers trending posts, links author and article, and labels untitled ones", () => {
    render(Discover, {
      props: { data: { posts: [post, { ...post, id: "p2", title: null, slug: null }], people: [], tags: [] } },
    });
    expect(screen.getAllByRole("link", { name: /Alice/ })[0]).toHaveAttribute("href", "/@alice");
    expect(screen.getByRole("link", { name: "Hello world" })).toHaveAttribute("href", "/@alice/hello-world");
    expect(screen.getByRole("link", { name: "Untitled" })).toBeInTheDocument();
  });

  it("suggests people with follower counts; Follow only when signed in", () => {
    const { unmount } = render(Discover, {
      props: {
        data: {
          posts: [],
          people: [person, { ...person, id: "u3", username: "cy", displayName: "Cy", followerCount: 4 }],
          tags: [],
        },
      },
    });
    expect(screen.getByText(/1\s+follower$/)).toBeInTheDocument();
    expect(screen.getByText(/4\s+followers/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Follow/ })).toBeNull();
    unmount();
    Object.assign(page.data, { user: { id: "me" } });
    try {
      render(Discover, { props: { data: { posts: [], people: [person], tags: [] } } });
      expect(screen.getByRole("button", { name: /Follow/ })).toBeInTheDocument();
    } finally {
      Object.assign(page.data, { user: null });
    }
  });

  it("links topics to their tag pages with post counts", () => {
    render(Discover, { props: { data: { posts: [], people: [], tags: [tag] } } });
    const link = screen.getByRole("link", { name: /Deno/ });
    expect(link).toHaveAttribute("href", "/tags/deno");
    expect(link).toHaveAttribute("title", "12 posts");
  });
});
