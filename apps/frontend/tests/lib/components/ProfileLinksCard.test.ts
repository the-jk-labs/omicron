import ProfileLinksCard from "$lib/components/ProfileLinksCard.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

test("links open in a new tab and verify identity with rel=me", () => {
  render(ProfileLinksCard, {
    props: {
      links: [
        { platform: "github", url: "https://github.com/ada", label: "" },
        { platform: "custom", url: "https://ada.example", label: "Portfolio" },
      ],
    },
  });
  const github = screen.getByRole("link", { name: /GitHub/ });
  expect(github).toHaveAttribute("href", "https://github.com/ada");
  expect(github).toHaveAttribute("target", "_blank");
  expect(github).toHaveAttribute("rel", "me noopener noreferrer");
  expect(github).toHaveTextContent("ada");
  // A custom link shows the author's own label.
  expect(screen.getByRole("link", { name: /Portfolio/ })).toHaveAttribute("href", "https://ada.example");
});
