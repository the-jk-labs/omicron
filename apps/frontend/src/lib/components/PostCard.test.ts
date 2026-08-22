import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for the card layout. The first pair guards the title and
// excerpt sharing one heading (the bug reported as "## UNIX-programming-timev
// Historically, UNIX systems have maintained two different time values…") —
// the card must expose the title as a heading and the excerpt as a separate
// paragraph. The second pair guards the reaction counters rendering as bare
// numbers ("2 0 0" on cards, "5 0 0" on the post page): each has to carry its
// meaning for hover and for assistive tech, or a sighted reader cannot tell a
// like from a response from a recommendation and a screen reader hears only
// digits. If any label or tooltip regresses, these tests fail.
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import PostCard from "./PostCard.svelte";

// `summary` is null on an editor-written post, so the card derives the excerpt
// from the body — the exact path that produced "UNIX-programming-timev
// Historically, UNIX systems have maintained two different time values…".
const post: Post = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "UNIX-programming-timev",
  slug: "unix-programming-timev",
  contentHtml: "<p>Historically, UNIX systems have maintained two different time values for a file.</p>",
  remote: false,
  summary: null,
  bannerUrl: null,
  createdAt: "2026-08-20T12:00:00.000Z",
  author: { id: "author-1", username: "timev", displayName: "timev", avatarUrl: null },
  tags: [],
  likeCount: 0,
  liked: false,
  commentCount: 0,
  recommendCount: 0,
  recommended: false,
  recommendedBy: null,
};

describe("PostCard", () => {
  it("names the heading from the title alone", () => {
    render(PostCard, { props: { post } });

    // The heading's accessible name must be exactly the title. Had the excerpt
    // leaked into the heading, the name would be "UNIX-programming-timev
    // Historically, …" and this exact match would miss.
    const heading = screen.getByRole("heading", { level: 2, name: "UNIX-programming-timev" });
    expect(heading).toBeInTheDocument();
    expect(heading).not.toHaveTextContent("Historically");
  });

  it("renders the excerpt in a paragraph outside the heading", () => {
    const { container } = render(PostCard, { props: { post } });

    const excerpt = screen.getByText(
      "Historically, UNIX systems have maintained two different time values for a file.",
    );
    expect(excerpt.tagName).toBe("P");

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading!.contains(excerpt)).toBe(false);
  });
});

describe("PostCard reaction counters", () => {
  it("labels the like and comment counters for screen readers and hover", () => {
    const counted: Post = { ...post, likeCount: 2, commentCount: 5, recommendCount: 3 };
    const { container } = render(PostCard, { props: { post: counted } });

    // Static counters: visual number is hidden from assistive tech, sr-only
    // text carries the phrase, and the wrapper exposes the same phrase as a
    // hover tooltip. Without any of the three, the card would read as "2 5 3".
    const likeSr = screen.getByText("2 likes");
    expect(likeSr).toHaveClass("sr-only");
    const likeWrap = likeSr.closest('[title="2 likes"]');
    expect(likeWrap).not.toBeNull();
    expect(likeWrap!.querySelector('[aria-hidden="true"]')).toHaveTextContent("2");

    const commentSr = screen.getByText("5 responses");
    expect(commentSr).toHaveClass("sr-only");
    const commentWrap = commentSr.closest('[title="5 responses"]');
    expect(commentWrap).not.toBeNull();
    expect(commentWrap!.querySelector('[aria-hidden="true"]')).toHaveTextContent("5");

    // Interactive counter: aria-label replaces the button's content as its
    // accessible name, so the count has to be in the label itself.
    const recBtn = screen.getByRole("button", { name: "Recommend (3 recommendations)" });
    expect(recBtn).toHaveAttribute("title", "Recommend (3 recommendations)");
    // The count is still visible, just not the accessible name.
    expect(recBtn).toHaveTextContent("3");

    // Ensure the static counters did not accidentally become buttons.
    expect(container.querySelectorAll('[title="2 likes"]').length).toBe(1);
  });

  it("uses singular forms when the count is one", () => {
    const counted: Post = { ...post, likeCount: 1, commentCount: 1, recommendCount: 1 };
    render(PostCard, { props: { post: counted } });

    expect(screen.getByText("1 like")).toBeInTheDocument();
    expect(screen.getByText("1 response")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recommend (1 recommendation)" })).toBeInTheDocument();
  });

  it("still labels a zero as a phrase, not a bare digit", () => {
    render(PostCard, { props: { post } });

    // `post` has 0 for every counter.
    expect(screen.getByText("0 likes")).toBeInTheDocument();
    expect(screen.getByText("0 responses")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recommend (0 recommendations)" })).toBeInTheDocument();
  });
});
