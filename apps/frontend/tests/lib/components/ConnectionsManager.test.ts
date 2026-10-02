import ConnectionsManager from "$lib/components/ConnectionsManager.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

const bob = { id: "u-bob", username: "bob", displayName: "Bob", avatarUrl: null, remote: false };
const eve = { id: "r-eve", username: "eve@remote.example", displayName: "Eve", avatarUrl: null, remote: true };

test("lists muted accounts on open and unmutes local and remote ones by their own route", async () => {
  const { fetch, calls } = fakeFetch({
    "GET /api/users/me/muted": { items: [bob, eve] },
    "DELETE /api/users/bob/mute": {},
    "DELETE /api/remote/users/eve%40remote.example/mute": {},
  });
  vi.stubGlobal("fetch", fetch);
  render(ConnectionsManager);
  await waitFor(() => screen.getByText("Bob"));
  const [unmuteBob, unmuteEve] = screen.getAllByRole("button", { name: "Unmute" });
  await fireEvent.click(unmuteBob);
  await waitFor(() => expect(screen.queryByText("Bob")).toBe(null));
  await fireEvent.click(unmuteEve);
  await waitFor(() => expect(screen.getByText("You haven't muted anyone.")).toBeInTheDocument());
  expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
    "GET /api/users/me/muted",
    "DELETE /api/users/bob/mute",
    "DELETE /api/remote/users/eve%40remote.example/mute",
  ]);
});

// BUG: a failed load is swallowed (`catch {}`) and the panel then renders its
// empty state, telling the reader "You haven't muted anyone." when the request
// merely failed. FollowedTagsManager and FollowListDialog do the same.
test.fails("BUG: a failed load says so instead of claiming the list is empty", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/users/me/muted": apiError(500) }).fetch);
  render(ConnectionsManager);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("You haven't muted anyone.")).toBe(null);
});
