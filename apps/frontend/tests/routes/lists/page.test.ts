import type { ReadingList } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import ListsPage from "../../../src/routes/lists/+page.svelte";
import { fakeFetch } from "../../fakeFetch";

function list(id: string, title: string, o: Partial<ReadingList> = {}): ReadingList {
  return {
    id,
    title,
    description: "",
    visibility: "private",
    isReadLater: false,
    itemCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    ...o,
  };
}

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.trim());

test("no lists invites creating one", () => {
  render(ListsPage, { props: { data: { lists: [] } as never } });
  expect(screen.getByText(/You don't have any lists yet/)).toBeInTheDocument();
});

test("a new list lands after Read later and before the rest", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "POST /api/lists": { list: list("n1", "Fresh") } }).fetch);
  render(ListsPage, {
    props: { data: { lists: [list("rl", "Read later", { isReadLater: true }), list("o1", "Older")] } as never },
  });
  expect(titles()).toEqual(["Read later", "Older"]);
  await fireEvent.click(screen.getByRole("button", { name: /New list/ }));
  await fireEvent.input(await screen.findByLabelText(/Title|Name/), { target: { value: "Fresh" } });
  await fireEvent.click(screen.getByRole("button", { name: /^(Create|Save)/ }));
  await screen.findByText("Fresh");
  expect(titles()).toEqual(["Read later", "Fresh", "Older"]);
});
