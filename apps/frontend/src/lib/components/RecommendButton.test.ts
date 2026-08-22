// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for the recommendation counter rendering as a bare number.
// The visible digit inside the button is not its accessible name — `aria-label`
// replaces the content — so the count has to be folded into the label itself,
// or a screen reader hears "Recommend" and never the number. The same phrase
// is mirrored in `title` for the hover tooltip. If either regresses, the card
// and post page would again show "2 0 0" / "5 0 0" to sighted users and silence
// to assistive tech.
import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import RecommendButton from "./RecommendButton.svelte";

describe("RecommendButton", () => {
  it("includes the count in its accessible name and hover tooltip", () => {
    render(RecommendButton, {
      props: { postId: "11111111-2222-3333-4444-555555555555", recommended: false, recommendCount: 2 },
    });

    const btn = screen.getByRole("button", { name: "Recommend (2 recommendations)" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("title", "Recommend (2 recommendations)");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn).toHaveTextContent("2");
  });

  it("switches the verb when already recommended", () => {
    render(RecommendButton, {
      props: { postId: "11111111-2222-3333-4444-555555555555", recommended: true, recommendCount: 1 },
    });

    const btn = screen.getByRole("button", { name: "Remove recommendation (1 recommendation)" });
    expect(btn).toHaveAttribute("title", "Remove recommendation (1 recommendation)");
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(btn).toHaveTextContent("1");
  });

  it("labels a zero with the plural phrase, not a bare digit", () => {
    render(RecommendButton, {
      props: { postId: "11111111-2222-3333-4444-555555555555", recommended: false, recommendCount: 0 },
    });

    expect(screen.getByRole("button", { name: "Recommend (0 recommendations)" })).toHaveAttribute(
      "title",
      "Recommend (0 recommendations)",
    );
  });
});
