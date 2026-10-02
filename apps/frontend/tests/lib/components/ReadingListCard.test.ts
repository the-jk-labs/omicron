import ReadingListCard from "$lib/components/ReadingListCard.svelte";
import type { ReadingList } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

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
  const card = screen.getByRole("link", { name: "Weekend reads" });
  expect(card).toHaveAttribute("href", "/lists/weekend-reads-66635376");
  expect(card).toHaveTextContent("2 posts");
  expect(card).toHaveTextContent("Long reads");
  expect(card).not.toHaveTextContent("Private");
});

test("one post is singular; a private list is marked", () => {
  render(ReadingListCard, { props: { list: list({ itemCount: 1, visibility: "private" }) } });
  const card = screen.getByRole("link");
  expect(card).toHaveTextContent("1 post");
  expect(card).toHaveTextContent("Private");
});
