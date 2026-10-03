// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import PrivacyPage from "../../../src/routes/privacy/+page.svelte";

vi.mock(
  import("$app/state"),
  () =>
    ({
      page: {
        data: { instance: { name: "Starlog", domain: "blog.example" } },
        url: new URL("http://localhost/privacy"),
      },
      navigating: null,
      updated: { current: false },
    }) as never,
);

test("is a placeholder notice naming the instance, with links to act on it", () => {
  render(PrivacyPage);
  expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
  expect(screen.getByText(`Last updated: ${new Date().getFullYear()} · blog.example`)).toBeInTheDocument();
  expect(screen.getByText("Starlog (blog.example)")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
});
