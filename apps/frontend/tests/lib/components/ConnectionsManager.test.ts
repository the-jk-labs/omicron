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

test("a failed load says so instead of claiming the list is empty", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/users/me/muted": apiError(500) }).fetch);
  render(ConnectionsManager);
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("You haven't muted anyone.")).toBe(null);
});

test("after a failed load, Try again loads the list", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    fakeFetch({
      "GET /api/users/me/muted": () => (fail ? apiError(500, "Mutes down") : Response.json({ items: [bob] })),
    }).fetch,
  );
  render(ConnectionsManager);
  await screen.findByText("Mutes down");
  fail = false;
  await fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Bob");
});

test("a failed unmute says so and keeps the row", async () => {
  vi.stubGlobal(
    "fetch",
    fakeFetch({
      "GET /api/users/me/muted": { items: [bob] },
      "DELETE /api/users/bob/mute": apiError(500, "Unmute failed"),
    }).fetch,
  );
  render(ConnectionsManager);
  await fireEvent.click(await screen.findByRole("button", { name: "Unmute" }));
  await screen.findByText("Unmute failed");
  expect(screen.getByText("Bob")).toBeInTheDocument();
});
