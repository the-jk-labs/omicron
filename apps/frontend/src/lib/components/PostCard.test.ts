import type { Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for the title and excerpt sharing one heading (the bug
// reported as "## UNIX-programming-timev Historically, UNIX systems have
// maintained two different time values…"). The card must expose the title as a
// heading and the excerpt as a separate paragraph, so a screen reader's
// heading list names the post and SEO reads a clean heading signal. If the
// excerpt ever ends up inside the `<h2>`, these tests fail.
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
