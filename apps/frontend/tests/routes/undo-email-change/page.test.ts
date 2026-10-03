// SPDX-License-Identifier: AGPL-3.0-or-later
import { refreshAll } from "$app/navigation";
import { page } from "$app/state";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import UndoPage from "../../../src/routes/undo-email-change/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

function open(token: string | null, routes: Parameters<typeof fakeFetch>[0] = {}) {
  page.url = new URL(`http://localhost/undo-email-change${token === null ? "" : `?token=${token}`}`);
  const api = fakeFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  render(UndoPage);
  return api;
}

afterEach(() => {
  page.url = new URL("http://localhost/");
});

// Mail scanners open links in emails on their own; only a click may act.
test("opening the link changes nothing until the button is pressed", () => {
  const api = open("tok", { "POST /api/email-change/undo": { email: "old@x.test" } });
  expect(screen.getByRole("heading", { name: "Undo the email change?" })).toBeInTheDocument();
  expect(screen.getByText(/all passkeys are removed, and your password stops working/)).toBeInTheDocument();
  expect(api.calls).toHaveLength(0);
});

test("undoing restores the address and says where the reset link went", async () => {
  const api = open("tok", { "POST /api/email-change/undo": { email: "old@x.test" } });
  await fireEvent.click(screen.getByRole("button", { name: "Undo and secure my account" }));
  await screen.findByRole("heading", { name: "Your account is secured" });
  expect(screen.getByText("old@x.test")).toBeInTheDocument();
  expect(api.calls[0]).toMatchObject({ method: "POST", path: "/api/email-change/undo", body: { token: "tok" } });
  expect(refreshAll).toHaveBeenCalled();
});

test("an expired or used link shows the server's reason", async () => {
  open("tok", { "POST /api/email-change/undo": apiError(400, "This link has expired or was already used.") });
  await fireEvent.click(screen.getByRole("button", { name: "Undo and secure my account" }));
  await screen.findByText("This link has expired or was already used.");
  expect(screen.getByRole("button", { name: "Undo and secure my account" })).toBeEnabled();
});

test("a link without a token says so instead of offering the button", () => {
  open(null);
  expect(screen.getByRole("heading", { name: "Link incomplete" })).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});
