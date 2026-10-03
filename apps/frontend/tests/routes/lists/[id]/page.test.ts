import { goto } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import type { Post, ReadingList } from "#lib/types.js";
import ListPage from "../../../../src/routes/lists/[id]/+page.svelte";
import { apiError, fakeFetch } from "../../../fakeFetch";
import { post } from "../../../fixtures";

const LIST_ID = "1f2e3d4c-0000-1111-2222-333344445555";
function list(o: Partial<ReadingList> = {}): ReadingList {
  return {
    id: LIST_ID,
    title: "Weekend reads",
    description: "",
    visibility: "public",
    isReadLater: false,
    itemCount: 2,
    createdAt: "2026-01-01T00:00:00Z",
    ...o,
  };
}

let api: ReturnType<typeof fakeFetch>;
function setup(
  o: { list?: Partial<ReadingList>; isOwner?: boolean; items?: Post[]; cursor?: string | null; seo?: unknown } = {},
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  api = fakeFetch({ "*": apiError(404), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(ListPage, {
    props: {
      data: {
        list: list(o.list),
        isOwner: o.isOwner ?? false,
        owner: { username: "ada", displayName: "Ada" },
        page: { items: o.items ?? [post()], nextCursor: o.cursor ?? null },
        seo: o.seo ?? null,
      } as never,
    },
  });
}

async function answerConfirm(ok: boolean) {
  await waitFor(() => expect(get(confirmRequest)).not.toBe(null));
  const req = get(confirmRequest)!;
  req.resolve({ ok, notify: false });
  confirmRequest.set(null);
  return req;
}

test("a visitor sees the list, its owner and its feed button, but no controls", () => {
  setup({ list: { description: "Long\nreads" } });
  expect(screen.getByRole("heading", { level: 1, name: "Weekend reads" })).toBeInTheDocument();
  expect(screen.getByText("2 posts")).toBeInTheDocument();
  expect(screen.getByText("Public")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Ada" })[0]).toHaveAttribute("href", "/@ada");
  expect(screen.getByRole("button", { name: "Copy RSS feed link for Weekend reads" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Edit/ })).toBe(null);
  expect(screen.queryByRole("button", { name: "Delete list" })).toBe(null);
});

test("a private list has no feed, and the owner gets Edit and Delete", () => {
  setup({ list: { visibility: "private", itemCount: 1 }, isOwner: true });
  expect(screen.getByText("1 post")).toBeInTheDocument();
  expect(screen.getByText("Private")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Your lists/ })).toHaveAttribute("href", "/lists");
  expect(screen.queryByRole("button", { name: /Copy RSS/ })).toBe(null);
  expect(screen.getByRole("button", { name: /Edit/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete list" })).toBeInTheDocument();
});

test("indexing off hides the feed button", () => {
  setup({ seo: { indexingEnabled: false } });
  expect(screen.queryByRole("button", { name: /Copy RSS/ })).toBe(null);
});

test("Read later can't be deleted", () => {
  setup({ list: { isReadLater: true, title: "Read later" }, isOwner: true });
  expect(screen.queryByRole("button", { name: "Delete list" })).toBe(null);
});

test("empty lists read differently for the owner", () => {
  const { unmount } = setup({ items: [], isOwner: true });
  expect(screen.getByText(/No articles saved yet/)).toBeInTheDocument();
  unmount();
  setup({ items: [] });
  expect(screen.getByText("This list is empty.")).toBeInTheDocument();
});

test("Show more appends the next page", async () => {
  setup(
    { cursor: "c1" },
    {
      [`GET /api/lists/${LIST_ID}/items?cursor=c1`]: { items: [post({ id: "p2", title: "Second" })], nextCursor: null },
    },
  );
  await fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  await screen.findByText("Second");
  expect(screen.queryByRole("button", { name: "Show more" })).toBe(null);
});

test("deleting confirms, then goes back to the lists", async () => {
  setup({ isOwner: true }, { [`DELETE /api/lists/${LIST_ID}`]: { ok: true } });
  await fireEvent.click(screen.getByRole("button", { name: "Delete list" }));
  expect((await answerConfirm(false)).description).toMatch(/^Delete "Weekend reads"\?/);
  expect(api.calls).toHaveLength(0);
  await fireEvent.click(screen.getByRole("button", { name: "Delete list" }));
  await answerConfirm(true);
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/lists"));
});

test("editing updates the header in place", async () => {
  setup({ isOwner: true }, { [`PATCH /api/lists/${LIST_ID}`]: { list: list({ title: "Renamed" }) } });
  await fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
  const title = await screen.findByLabelText(/Title|Name/);
  await fireEvent.input(title, { target: { value: "Renamed" } });
  await fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
  await screen.findByRole("heading", { level: 1, name: "Renamed" });
});

test("a failed delete tells the owner", async () => {
  setup({ isOwner: true }, { [`DELETE /api/lists/${LIST_ID}`]: apiError(500, "List delete failed") });
  await fireEvent.click(screen.getByRole("button", { name: "Delete list" }));
  await answerConfirm(true);
  await screen.findByText(/List delete failed|Couldn't delete|Failed to delete/, undefined, { timeout: 500 });
});
