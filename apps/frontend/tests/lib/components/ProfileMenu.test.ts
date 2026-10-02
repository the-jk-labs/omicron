import ProfileMenu from "$lib/components/ProfileMenu.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

let api: ReturnType<typeof fakeFetch>;
function setup(
  props: { username?: string; remote?: boolean; muted?: boolean; blocked?: boolean } = {},
  routes: Parameters<typeof fakeFetch>[0] = {},
) {
  api = fakeFetch({ "*": { ok: true }, ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(ProfileMenu, { props: { username: "bob", muted: false, blocked: false, ...props } });
}

// The trigger is disabled while a request is in flight.
async function openMenu() {
  const trigger = screen.getByRole("button", { name: "More actions" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await fireEvent.keyDown(trigger, { key: "Enter" });
}
async function choose(item: string) {
  await openMenu();
  await fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}
async function labels() {
  await openMenu();
  await screen.findByRole("menu");
  return screen.getAllByRole("menuitem").map((i) => i.textContent?.trim());
}
const call = () => api.calls.at(-1) && `${api.calls.at(-1)!.method} ${api.calls.at(-1)!.path}`;

test("mute and block a local account, then undo both", async () => {
  setup();
  await choose("Mute");
  await waitFor(() => expect(call()).toBe("POST /api/users/bob/mute"));
  await choose("Block");
  await waitFor(() => expect(call()).toBe("POST /api/users/bob/block"));
  expect(await labels()).toEqual(["Unmute", "Unblock"]);
  await fireEvent.click(screen.getByRole("menuitem", { name: "Unmute" }));
  await waitFor(() => expect(call()).toBe("DELETE /api/users/bob/mute"));
  await choose("Unblock");
  await waitFor(() => expect(call()).toBe("DELETE /api/users/bob/block"));
});

test("a remote account goes through the remote endpoints with its handle encoded", async () => {
  setup({ username: "zed@social.example", remote: true, muted: true });
  await choose("Unmute");
  await waitFor(() => expect(call()).toBe("DELETE /api/remote/users/zed%40social.example/mute"));
  await choose("Block");
  await waitFor(() => expect(call()).toBe("POST /api/remote/users/zed%40social.example/block"));
});

test("a failed request leaves the state as it was", async () => {
  setup({}, { "POST /api/users/bob/mute": apiError(500, "Mute failed [BUG pin]") });
  await choose("Mute");
  await waitFor(() => expect(api.calls).toHaveLength(1));
  expect(await labels()).toEqual(["Mute", "Block"]);
});

test("props re-sync when the menu is reused for another profile", async () => {
  const { rerender } = setup();
  await rerender({ username: "cy", muted: true, blocked: true });
  expect(await labels()).toEqual(["Unmute", "Unblock"]);
});

// B73: toggleBlock has try/finally and no catch. A failed block shows no
// message — the menu just closes — so the reader may believe they've blocked
// someone they haven't. The rejection is unhandled.
test.fails("BUG: a failed block tells the reader", async () => {
  setup({}, { "POST /api/users/bob/block": apiError(500, "Block failed [BUG pin]") });
  await choose("Block");
  await screen.findByText(/Block failed|Couldn't|Failed to/, undefined, { timeout: 500 });
});
