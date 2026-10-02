import { goto } from "$app/navigation";
import { page } from "$app/state";
import RecommendButton from "$lib/components/RecommendButton.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for the recommendation counter rendering as a bare number.
// The visible digit inside the button is not its accessible name — `aria-label`
// replaces the content — so the count has to be folded into the label itself,
// or a screen reader hears "Recommend" and never the number. The same phrase
// is mirrored in `title` for the hover tooltip. If either regresses, the card
// and post page would again show "2 0 0" / "5 0 0" to sighted users and silence
// to assistive tech.
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

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

describe("RecommendButton toggling", () => {
  afterEach(() => {
    page.data.user = null;
  });

  it("a guest is sent to sign in, and nothing is posted", async () => {
    const { fetch } = fakeFetch();
    vi.stubGlobal("fetch", fetch);
    render(RecommendButton, { props: { postId: "p1", recommended: false, recommendCount: 2 } });
    await fireEvent.click(screen.getByRole("button"));
    expect(goto).toHaveBeenCalledWith("/login");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("recommends optimistically, then settles on the server's numbers", async () => {
    page.data.user = { id: "u1" } as never;
    vi.stubGlobal(
      "fetch",
      fakeFetch({ "POST /api/posts/p1/recommend": { recommended: true, recommendCount: 7 } }).fetch,
    );
    render(RecommendButton, { props: { postId: "p1", recommended: false, recommendCount: 2 } });
    await fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("7"));
  });

  it("a failed un-recommend puts the button back", async () => {
    page.data.user = { id: "u1" } as never;
    vi.stubGlobal("fetch", fakeFetch({ "DELETE /api/posts/p1/recommend": apiError(500) }).fetch);
    render(RecommendButton, { props: { postId: "p1", recommended: true, recommendCount: 3 } });
    await fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button")).toHaveTextContent("3");
  });
});
