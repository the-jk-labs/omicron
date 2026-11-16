// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import AdminBlockedActors from "#lib/components/AdminBlockedActors.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import { apiError, fakeFetch } from "../../fakeFetch";

const spam = {
  apId: "https://bad.example/users/spam",
  handle: "spam@bad.example",
  reason: "bot",
  createdAt: "2026-01-01T00:00:00Z",
};

function setup(routes: Parameters<typeof fakeFetch>[0], initial?: { actors: (typeof spam)[] }) {
  const f = fakeFetch(routes);
  vi.stubGlobal("fetch", f.fetch);
  render(AdminBlockedActors, { initial });
  return f;
}

test("an empty list says so", async () => {
  setup({ "GET /api/admin/blocked-actors": { actors: [] } });
  await waitFor(() => screen.getByText("No accounts blocked."));
});

test("blocking sends the account and lists it", async () => {
  const { calls } = setup({
    "GET /api/admin/blocked-actors": { actors: [] },
    "POST /api/admin/blocked-actors": { actor: spam },
  });
  await waitFor(() => screen.getByText("No accounts blocked."));
  await fireEvent.input(screen.getByPlaceholderText("user@example.social"), {
    target: { value: " @spam@bad.example " },
  });
  await fireEvent.input(screen.getByLabelText("Reason (optional)"), { target: { value: "bot" } });
  await fireEvent.click(screen.getByRole("button", { name: "Block account" }));
  await waitFor(() => screen.getByText("Blocked @spam@bad.example. Its cached profile and posts were removed."));
  expect(screen.getByText("@spam@bad.example")).toBeInTheDocument();
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ account: "@spam@bad.example", reason: "bot" });
});

test("an account that can't be found shows the server's reason", async () => {
  setup({
    "GET /api/admin/blocked-actors": { actors: [] },
    "POST /api/admin/blocked-actors": apiError(404, "Couldn't find that account."),
  });
  await waitFor(() => screen.getByText("No accounts blocked."));
  await fireEvent.input(screen.getByPlaceholderText("user@example.social"), { target: { value: "ghost@x.example" } });
  await fireEvent.click(screen.getByRole("button", { name: "Block account" }));
  await waitFor(() => screen.getByText("Couldn't find that account."));
});

test("unblocking asks first and sends the actor id", async () => {
  const { calls } = setup({ "DELETE /api/admin/blocked-actors": { ok: true } }, { actors: [spam] });
  await fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
  expect(get(confirmRequest)?.title).toBe("Unblock @spam@bad.example?");
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => screen.getByText("No accounts blocked."));
  expect(calls.find((c) => c.method === "DELETE")?.path).toBe(
    `/api/admin/blocked-actors?apId=${encodeURIComponent(spam.apId)}`,
  );
});

test("the server-loaded list renders without fetching", () => {
  const { calls } = setup({}, { actors: [spam] });
  expect(screen.getByText("@spam@bad.example")).toBeInTheDocument();
  expect(calls).toEqual([]);
});
