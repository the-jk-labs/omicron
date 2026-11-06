// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import ReadingListCard from "#lib/components/ReadingListCard.svelte";
import type { ReadingList } from "#lib/types.js";

const list = (over: Partial<ReadingList>): ReadingList => ({
  id: "66635376-aaaa",
  title: "Weekend reads",
  description: "",
  visibility: "public",
  isReadLater: false,
  itemCount: 2,
  createdAt: "2026-01-01T00:00:00Z",
  ...over,
});

test("links to the list's canonical path, named by its title, with a post count", () => {
  render(ReadingListCard, { props: { list: list({ description: "Long reads" }) } });
  const link = screen.getByRole("link", { name: "Weekend reads" });
  expect(link).toHaveAttribute("href", "/lists/weekend-reads-66635376");
  // WCAG 2.5.3: the link's name is exactly its visible text; the rest sits beside it.
  expect(link).toHaveTextContent(/^Weekend reads$/);
  expect(screen.getByText("2 posts")).toBeInTheDocument();
  expect(screen.getByText("Long reads")).toBeInTheDocument();
  expect(screen.queryByText("Private")).toBe(null);
});

test("one post is singular; a private list is marked", () => {
  render(ReadingListCard, { props: { list: list({ itemCount: 1, visibility: "private" }) } });
  expect(screen.getByText("1 post")).toBeInTheDocument();
  expect(screen.getByText("Private")).toBeInTheDocument();
});
