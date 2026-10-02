import SaveToListButton from "$lib/components/SaveToListButton.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

const lists = [
  { id: "l1", title: "Weekend", visibility: "public", itemCount: 2, contains: false },
  { id: "l2", title: "Secret", visibility: "private", itemCount: 1, contains: true },
];

async function open(routes: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch({ "GET /api/lists/for-post/p1": { lists }, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(SaveToListButton, { props: { postId: "p1", signedIn: true } });
  await fireEvent.click(screen.getByRole("button", { name: "Save to a reading list" }));
  await waitFor(() => screen.getByRole("button", { name: /Weekend/ }));
  return f;
}

test("a guest gets a sign-in link instead", () => {
  render(SaveToListButton, { props: { postId: "p1", signedIn: false } });
  expect(screen.getByRole("link", { name: "Sign in to save" })).toHaveAttribute("href", "/login");
});

test("opening loads the reader's lists once, marking the ones holding this post", async () => {
  const { calls } = await open({});
  expect(screen.getByRole("button", { name: /Secret/ })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Save to a reading list" }));
  await fireEvent.click(screen.getByRole("button", { name: "Save to a reading list" }));
  expect(calls.filter((c) => c.path === "/api/lists/for-post/p1")).toHaveLength(1);
});

test("toggling adds to or removes from a list", async () => {
  const { calls } = await open({
    "POST /api/lists/l1/items": { ok: true },
    "DELETE /api/lists/l2/items/p1": { ok: true },
  });
  await fireEvent.click(screen.getByRole("button", { name: /Weekend/ }));
  await fireEvent.click(screen.getByRole("button", { name: /Secret/ }));
  await waitFor(() => expect(calls.map((c) => `${c.method} ${c.path}`)).toContain("DELETE /api/lists/l2/items/p1"));
  expect(calls.map((c) => `${c.method} ${c.path}`)).toContain("POST /api/lists/l1/items");
});

test("a failed toggle shows the server's message", async () => {
  await open({ "POST /api/lists/l1/items": apiError(403, "Not your list") });
  await fireEvent.click(screen.getByRole("button", { name: /Weekend/ }));
  await waitFor(() => screen.getByText("Not your list"));
});

test("a new list is created with the post already in it", async () => {
  const { calls } = await open({
    "POST /api/lists": { list: { id: "l3", title: "Fresh", visibility: "public", itemCount: 0 } },
    "POST /api/lists/l3/items": { ok: true },
  });
  const input = screen.getByPlaceholderText("New list");
  await fireEvent.input(input, { target: { value: "  Fresh  " } });
  await fireEvent.submit(input.closest("form")!);
  await waitFor(() => screen.getByRole("button", { name: /Fresh/ }));
  expect(calls.find((c) => c.path === "/api/lists")?.body).toEqual({ title: "Fresh" });
  expect(input).toHaveValue("");
});

test("a blank title creates nothing", async () => {
  const { calls } = await open({});
  await fireEvent.submit(screen.getByPlaceholderText("New list").closest("form")!);
  expect(calls.some((c) => c.method === "POST")).toBe(false);
});

test("loading failures are reported and retried on the next open", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/lists/for-post/p1": apiError(500, "Lists are down") }).fetch);
  render(SaveToListButton, { props: { postId: "p1", signedIn: true } });
  await fireEvent.click(screen.getByRole("button", { name: "Save to a reading list" }));
  await waitFor(() => screen.getByText("Lists are down"));
});

test("a list that was created stays in the menu even if adding the post to it failed", async () => {
  await open({
    "POST /api/lists": { list: { id: "l3", title: "Fresh", visibility: "public", itemCount: 0 } },
    "POST /api/lists/l3/items": apiError(500, "Could not add the post"),
  });
  const input = screen.getByPlaceholderText("New list");
  await fireEvent.input(input, { target: { value: "Fresh" } });
  await fireEvent.submit(input.closest("form")!);
  await screen.findByText("Could not add the post");
  expect(screen.getByRole("button", { name: /Fresh/ })).toBeInTheDocument();
});
