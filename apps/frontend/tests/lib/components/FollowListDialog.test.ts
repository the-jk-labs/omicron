import FollowListDialog from "$lib/components/FollowListDialog.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

const actor = (username: string) => ({
  id: `id-${username}`,
  username,
  displayName: username.toUpperCase(),
  avatarUrl: null,
});
const trigger = createRawSnippet(() => ({ render: () => "<span>3 followers</span>" }));

let api: ReturnType<typeof fakeFetch>;
function setup(
  props: { kind?: "followers" | "following"; canRemove?: boolean; onRemoved?: () => void; username?: string } = {},
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  api = fakeFetch({
    "GET /api/users/ada/followers": { items: [actor("bob"), actor("zed@social.example")] },
    "GET /api/users/ada/following": { items: [] },
    "*": { ok: true },
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(FollowListDialog, {
    props: { username: "ada", kind: "followers", title: "Followers", children: trigger, ...props },
  });
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "3 followers" }));
const listCalls = () => api.calls.filter((c) => c.method === "GET");

test("opening loads the list once and links each person", async () => {
  setup();
  await open();
  expect(screen.getByRole("dialog", { name: "Followers" })).toBeInTheDocument();
  await screen.findByText("BOB");
  expect(screen.getByRole("link", { name: /ZED@SOCIAL\.EXAMPLE/ })).toHaveAttribute("href", "/@zed@social.example");
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await open();
  await screen.findByText("BOB");
  expect(listCalls()).toHaveLength(1);
});

test("an empty following list says so", async () => {
  setup({ kind: "following" });
  await open();
  await screen.findByText("Not following anyone yet.");
});

test("following someone's link closes the dialog", async () => {
  setup();
  await open();
  await fireEvent.click(await screen.findByRole("link", { name: /BOB/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBe(null));
});

test("removing a follower takes a second click, then drops the row and reports it", async () => {
  const onRemoved = vi.fn();
  setup({ canRemove: true, onRemoved });
  await open();
  await screen.findByText("BOB");
  const [remove] = screen.getAllByRole("button", { name: "Remove" });
  await fireEvent.click(remove);
  expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
  await fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(screen.queryByText("BOB")).toBe(null));
  expect(api.calls.find((c) => c.method === "DELETE")?.path).toBe("/api/users/me/followers/bob");
  expect(onRemoved).toHaveBeenCalledTimes(1);
});

test("a remote follower is removed by its full handle", async () => {
  setup({ canRemove: true });
  await open();
  await screen.findByText("ZED@SOCIAL.EXAMPLE");
  const remove = screen.getAllByRole("button", { name: "Remove" })[1];
  await fireEvent.click(remove);
  await fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() => expect(api.calls.at(-1)?.path).toBe("/api/users/me/followers/zed%40social.example"));
});

test("other people's lists have no Remove action", async () => {
  setup();
  await open();
  await screen.findByText("BOB");
  expect(screen.queryByRole("button", { name: "Remove" })).toBe(null);
});

test("a new profile clears the cached list", async () => {
  const { rerender } = setup({}, { "GET /api/users/cy/followers": { items: [actor("dee")] } });
  await open();
  await screen.findByText("BOB");
  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await rerender({ username: "cy" });
  await open();
  await screen.findByText("DEE");
  expect(screen.queryByText("BOB")).toBe(null);
});

test("a failed load doesn't claim there are no followers", async () => {
  setup({}, { "GET /api/users/ada/followers": apiError(500, "Followers down") });
  await open();
  await waitFor(() => expect(listCalls()).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("No followers yet.")).toBe(null);
});
