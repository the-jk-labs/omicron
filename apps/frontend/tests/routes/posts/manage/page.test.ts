import { goto, invalidateAll, replaceState } from "$app/navigation";
import { confirmRequest } from "$lib/components/ui/confirm";
import type { OwnPostStatus, Post } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import ManagePage from "../../../../src/routes/posts/manage/+page.svelte";
import { apiError, fakeFetch } from "../../../fakeFetch";
import { post } from "../../../fixtures";

type Counts = Record<OwnPostStatus, number>;
const draft = post({ id: "d1", title: "A draft", status: "draft" } as Partial<Post>);
const live = post({ id: "p1", title: "Live post", slug: "live-post", status: "published" } as Partial<Post>);
const queued = post({
  id: "s1",
  title: "Queued post",
  status: "scheduled",
  publishAt: "2099-01-01T09:00:00Z",
} as Partial<Post>);

function data(
  tab: OwnPostStatus,
  items: Post[],
  counts: Counts = { draft: 1, scheduled: 1, published: 1 },
  nextCursor: string | null = null,
) {
  return { tab, page: { items, nextCursor }, counts, user: { id: "author-1" } };
}

let api: ReturnType<typeof fakeFetch>;
function setup(d: ReturnType<typeof data>, routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({
    "GET /api/posts/mine?status=draft": { items: [draft], nextCursor: null },
    "GET /api/posts/mine?status=scheduled": { items: [queued], nextCursor: null },
    "GET /api/posts/mine?status=published": { items: [live], nextCursor: null },
    "*": { ok: true },
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(ManagePage, { props: { data: d as never } });
}

async function openTab(label: string) {
  const tab = screen.getByRole("tab", { name: new RegExp(`^${label}`) });
  await fireEvent.mouseDown(tab);
  await fireEvent.click(tab);
  await waitFor(() => expect(tab).toHaveAttribute("aria-selected", "true"));
}
const panel = () => screen.getByRole("tabpanel");

async function rowMenu(item: string) {
  await fireEvent.keyDown(within(panel()).getByRole("button", { name: "More actions" }), { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

async function answerConfirm(ok: boolean) {
  await waitFor(() => expect(get(confirmRequest)).not.toBe(null));
  const req = get(confirmRequest)!;
  req.resolve({ ok, notify: false });
  confirmRequest.set(null);
  return req;
}

test("opens on the loaded tab with counts on every tab", () => {
  setup(data("draft", [draft], { draft: 1, scheduled: 0, published: 4 }));
  expect(screen.getByRole("tab", { name: /^Drafts/ })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: /^Scheduled/ })).toHaveTextContent("0");
  expect(screen.getByRole("tab", { name: /^Published/ })).toHaveTextContent("4");
  expect(within(panel()).getByText("A draft")).toBeInTheDocument();
  expect(within(panel()).getByRole("link", { name: /Continue/ })).toHaveAttribute("href", "/compose?id=d1");
});

test("an untitled draft is labelled as such", () => {
  setup(data("draft", [post({ id: "d2", title: "  " })]));
  expect(screen.getByText("Untitled draft")).toBeInTheDocument();
});

test("each tab's empty state says what belongs there", () => {
  setup(data("scheduled", [], { draft: 0, scheduled: 0, published: 0 }));
  expect(screen.getByText("Nothing is queued. Give a draft a time and it will publish itself.")).toBeInTheDocument();
});

test("another tab loads once on first open, and the address bar follows", async () => {
  setup(data("draft", [draft]));
  await openTab("Published");
  await within(panel()).findByText("Live post");
  expect(replaceState).toHaveBeenCalledWith("/posts/manage?tab=published", {});
  expect(within(panel()).getByRole("link", { name: /Edit/ })).toHaveAttribute("href", "/posts/p1/edit");
  await openTab("Drafts");
  await openTab("Published");
  expect(api.calls.filter((c) => c.path === "/api/posts/mine?status=published")).toHaveLength(1);
});

test("a tab that fails to load says so", async () => {
  setup(data("draft", [draft]), { "GET /api/posts/mine?status=scheduled": apiError(500, "Queue unreadable") });
  await openTab("Scheduled");
  await screen.findByText("Queue unreadable");
});

test("a scheduled row says when it publishes", async () => {
  setup(data("scheduled", [queued]));
  expect(within(panel()).getByText(/^Publishes /)).toBeInTheDocument();
});

test("load more appends; a failure is shown", async () => {
  let n = 0;
  setup(data("draft", [draft], undefined, "c1"), {
    "GET /api/posts/mine?status=draft&cursor=c1": () =>
      ++n === 1
        ? apiError(500, "Page two broke")
        : Response.json({ items: [post({ id: "d9", title: "Older draft" })], nextCursor: null }),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Page two broke");
  await fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await screen.findByText("Older draft");
  expect(screen.queryByRole("button", { name: "Load more" })).toBe(null);
});

test.for([
  ["scheduled", queued, "Publish now", { status: "published" }],
  ["scheduled", queued, "Unschedule", { status: "draft" }],
] as const)("%s → %s updates the post and reloads", async ([tab, row, item, body]) => {
  setup(data(tab, [row]));
  await rowMenu(item);
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  expect(api.calls.find((c) => c.method === "PATCH")).toMatchObject({ path: `/api/posts/${row.id}`, body });
});

test("unpublishing and deleting confirm first", async () => {
  setup(data("published", [live]));
  await rowMenu("Unpublish");
  expect((await answerConfirm(false)).title).toBe("Unpublish post");
  expect(api.calls.some((c) => c.method === "PATCH")).toBe(false);

  await rowMenu("Delete");
  const req = await answerConfirm(true);
  expect(req.title).toBe("Delete post");
  await waitFor(() => expect(api.calls.find((c) => c.method === "DELETE")?.path).toBe("/api/posts/p1"));
});

test("a draft's delete prompt calls it a draft", async () => {
  setup(data("draft", [draft]));
  await rowMenu("Delete");
  expect((await answerConfirm(false)).description).toBe("Delete this draft? This can't be undone.");
});

test("View post goes to the article", async () => {
  setup(data("published", [live]));
  await rowMenu("View post");
  expect(goto).toHaveBeenCalledWith("/@ada/live-post");
});

test("a failed action is shown and nothing reloads", async () => {
  setup(data("scheduled", [queued]), { "PATCH /api/posts/s1": apiError(409, "Already published") });
  await rowMenu("Publish now");
  await screen.findByText("Already published");
  expect(invalidateAll).not.toHaveBeenCalled();
});

test("a reload from the server replaces the list and the counts", async () => {
  const { rerender } = setup(data("draft", [draft], { draft: 1, scheduled: 0, published: 0 }));
  await rerender({ data: data("draft", [], { draft: 0, scheduled: 0, published: 1 }) as never });
  expect(screen.getByText("Nothing unfinished. Posts you save without publishing wait here.")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /^Published/ })).toHaveTextContent("1");
});

// BUG: tabs switch with replaceState (shallow routing), which leaves SvelteKit's
// own URL at the one the page loaded with (client.js replaceState keeps
// page.url; _invalidate reloads current.url). So the invalidateAll() after an
// action reloads the *original* tab, and the effect sets `active = data.tab`:
// the author is thrown back to Drafts, and the tab they acted on keeps showing
// the post they just unpublished.
test.fails("BUG: acting on another tab keeps the author on that tab", async () => {
  const { rerender } = setup(data("draft", [draft]));
  // What SvelteKit does on invalidateAll here: re-run the load for the URL the
  // page was loaded with, /posts/manage?tab=draft.
  vi.mocked(invalidateAll).mockImplementation(async () => {
    await rerender({ data: data("draft", [draft], { draft: 2, scheduled: 1, published: 0 }) as never });
  });
  await openTab("Published");
  await within(panel()).findByText("Live post");
  await rowMenu("Unpublish");
  await answerConfirm(true);
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  expect(screen.getByRole("tab", { name: /^Published/ })).toHaveAttribute("aria-selected", "true");
});
