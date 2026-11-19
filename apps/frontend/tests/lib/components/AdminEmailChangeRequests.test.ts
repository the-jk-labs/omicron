// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import AdminEmailChangeRequests from "#lib/components/AdminEmailChangeRequests.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import type { EmailChangeRequest } from "#lib/types.js";
import { apiError, fakeFetch } from "../../fakeFetch";

const request: EmailChangeRequest = {
  id: "req",
  user: { id: "u-ada", username: "ada", displayName: "Ada", email: "ada@example.com" },
  requestedBy: { id: "u-mod", username: "mod", displayName: "Mod" },
  newEmail: "new@example.com",
  createdAt: "2026-11-01T00:00:00Z",
};

function setup(routes: Parameters<typeof fakeFetch>[0] = {}, initial: EmailChangeRequest[] | null = [request]) {
  const f = fakeFetch(routes);
  vi.stubGlobal("fetch", f.fetch);
  const onapproved = vi.fn<(user: unknown) => void>();
  render(AdminEmailChangeRequests, { props: { initial, onapproved } });
  return { ...f, onapproved };
}

async function answer(ok: boolean) {
  await waitFor(() => expect(get(confirmRequest)).not.toBe(null));
  get(confirmRequest)!.resolve({ ok, notify: false });
  confirmRequest.set(null);
}

test("shows the account, both addresses and the moderator who asked", () => {
  setup();
  expect(screen.getByText("Login email changes awaiting approval")).toBeInTheDocument();
  expect(screen.getByText("new@example.com")).toBeInTheDocument();
  expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
  expect(screen.getByText(/Asked by @mod/)).toBeInTheDocument();
});

test("approving changes the email after a warning, and updates the table", async () => {
  const { calls, onapproved } = setup({
    "POST /api/admin/email-change-requests/req/approve": { user: { id: "u-ada", email: "new@example.com" } },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Approve…" }));
  expect(get(confirmRequest)?.description).toMatch(/can sign in as this account/);
  await answer(true);
  await screen.findByText(/login email is now new@example.com/);
  expect(calls.some((c) => c.method === "POST")).toBe(true);
  expect(onapproved).toHaveBeenCalledWith({ id: "u-ada", email: "new@example.com" });
  expect(screen.queryByRole("button", { name: "Approve…" })).toBe(null);
});

test("declining leaves the email as it was", async () => {
  const { calls } = setup({ "DELETE /api/admin/email-change-requests/req": { ok: true } });
  await fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  await answer(true);
  await screen.findByText(/login email is unchanged/);
  expect(calls.map((c) => c.method)).toEqual(["DELETE"]);
});

test("backing out of the confirmation sends nothing", async () => {
  const { calls } = setup();
  await fireEvent.click(screen.getByRole("button", { name: "Approve…" }));
  await answer(false);
  expect(calls).toEqual([]);
});

test("a refusal says why and keeps the request", async () => {
  setup({ "POST /api/admin/email-change-requests/req/approve": apiError(400, "That email is already in use.") });
  await fireEvent.click(screen.getByRole("button", { name: "Approve…" }));
  await answer(true);
  await screen.findByText("That email is already in use.");
  expect(screen.getByRole("button", { name: "Approve…" })).toBeInTheDocument();
});

test("nothing pending, nothing shown", () => {
  setup({}, []);
  expect(screen.queryByText("Login email changes awaiting approval")).toBe(null);
});
