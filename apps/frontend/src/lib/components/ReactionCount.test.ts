// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import ReactionCount from "./ReactionCount.svelte";

describe("ReactionCount", () => {
  it("renders the count with title, sr-only and aria-hidden", () => {
    render(ReactionCount, { props: { icon: "heart", count: 2, singular: "like", size: 13 } });

    const sr = screen.getByText("2 likes");
    expect(sr).toHaveClass("sr-only");
    const wrap = sr.closest('[title="2 likes"]');
    expect(wrap).not.toBeNull();
    expect(wrap!.querySelector('[aria-hidden="true"]')).toHaveTextContent("2");
  });

  it("uses singular for count 1 and plural for 0 and many", () => {
    const { unmount } = render(ReactionCount, {
      props: { icon: "comment", count: 1, singular: "response", size: 12 },
    });
    expect(screen.getByText("1 response")).toBeInTheDocument();
    expect(screen.getByTitle("1 response")).toBeInTheDocument();
    unmount();

    render(ReactionCount, { props: { icon: "comment", count: 0, singular: "response", size: 12 } });
    expect(screen.getByText("0 responses")).toBeInTheDocument();
  });

  it("supports custom plural for recommendation", () => {
    render(ReactionCount, {
      props: { icon: "recommend", count: 3, singular: "recommendation", size: 12 },
    });
    expect(screen.getByText("3 recommendations")).toBeInTheDocument();
    expect(screen.getByTitle("3 recommendations")).toBeInTheDocument();
  });
});
