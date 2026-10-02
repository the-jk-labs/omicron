import type { FollowRequest } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import FollowRequestsPage from "../../../src/routes/follow-requests/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

const req = (id: string, username: string): FollowRequest => ({
  requestId: id,
  actor: { id: `u-${username}`, username, displayName: username.toUpperCase(), avatarUrl: null, remote: false },
  createdAt: new Date().toISOString(),
});

let api: ReturnType<typeof fakeFetch>;
function setup(requests: FollowRequest[], routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({ "*": { ok: true }, ...routes });
  vi.stubGlobal("fetch", api.fetch);
  return render(FollowRequestsPage, { props: { data: { requests } as never } });
}

test("no pending requests says so", () => {
  setup([]);
  expect(screen.getByText("You have no pending follow requests.")).toBeInTheDocument();
});

test("each request links the person once", () => {
  setup([req("r1", "bob"), req("r2", "zed@social.example")]);
  expect(screen.getByRole("link", { name: /BOB/ })).toHaveAttribute("href", "/@bob");
  expect(screen.getByRole("link", { name: /ZED@SOCIAL\.EXAMPLE/ })).toHaveAttribute("href", "/@zed@social.example");
});

test("approving and rejecting answer the request and drop its row", async () => {
  setup([req("r1", "bob"), req("r2", "cy")]);
  const [approveBob] = screen.getAllByRole("button", { name: /Approve/ });
  await fireEvent.click(approveBob!);
  await waitFor(() => expect(screen.queryByText("BOB")).toBe(null));
  await fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
  await screen.findByText("You have no pending follow requests.");
  expect(api.calls.map((c) => c.path)).toEqual([
    "/api/users/me/follow-requests/r1/approve",
    "/api/users/me/follow-requests/r2/reject",
  ]);
});

test("a reload of the page data replaces the list", async () => {
  const { rerender } = setup([req("r1", "bob")]);
  await rerender({ data: { requests: [req("r3", "dee")] } as never });
  expect(screen.getByText("DEE")).toBeInTheDocument();
  expect(screen.queryByText("BOB")).toBe(null);
});

// BUG: act() has try/finally and no catch: a failed approve/reject leaves the
// row as it was with no message, and the rejection is unhandled.
test.fails("BUG: a failed approval tells the account owner", async () => {
  setup([req("r1", "bob")], {
    "POST /api/users/me/follow-requests/r1/approve": apiError(500, "Approve failed [BUG pin]"),
  });
  await fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
  await screen.findByText(/Approve failed|Couldn't|Failed to/, undefined, { timeout: 500 });
});
