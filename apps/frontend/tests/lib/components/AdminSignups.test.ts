// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminSignups from "#lib/components/AdminSignups.svelte";
import type { Invite } from "#lib/types.js";
import { apiError, fakeFetch, type Routes } from "../../fakeFetch";

const unused: Invite = {
  id: "i1",
  expiresAt: "2030-01-08T00:00:00Z",
  usedAt: null,
  usedByUsername: null,
  createdAt: "2030-01-01T00:00:00Z",
};
const used: Invite = { ...unused, id: "i2", usedAt: "2030-01-02T00:00:00Z", usedByUsername: "ada" };

async function setup(routes: Routes = {}, settings = { inviteOnly: true, invites: [unused, used] }) {
  const api = fakeFetch({
    "GET /api/admin/signups": settings,
    "PUT /api/admin/signups": { ok: true },
    "*": { ok: true },
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  render(AdminSignups);
  await waitFor(() => expect(screen.getByRole("switch")).not.toBeDisabled());
  return api;
}

test("open sign-up shows the switch off and no invite controls", async () => {
  await setup({}, { inviteOnly: false, invites: [] });
  expect(screen.getByRole("switch")).toHaveAttribute("data-state", "unchecked");
  expect(screen.queryByRole("button", { name: /Create invite/ })).toBe(null);
});

test("turning it on saves and reveals the invite controls", async () => {
  await setup({}, { inviteOnly: false, invites: [] });
  await fireEvent.click(screen.getByRole("switch"));
  await screen.findByRole("button", { name: /Create invite/ });
  expect(screen.getByRole("switch")).toHaveAttribute("data-state", "checked");
});

test("a failed save puts the switch back and says why", async () => {
  await setup({ "PUT /api/admin/signups": () => apiError(500, "Nope") }, { inviteOnly: false, invites: [] });
  await fireEvent.click(screen.getByRole("switch"));
  expect((await screen.findByRole("alert")).textContent).toContain("Nope");
  expect(screen.getByRole("switch")).toHaveAttribute("data-state", "unchecked");
});

test("lists who used an invite, and only unused ones can be revoked", async () => {
  await setup();
  expect(screen.getByText(/Used by @ada/)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
});

test("a new invite shows its link once", async () => {
  await setup({
    "POST /api/admin/invites": { invite: { ...unused, id: "i3" }, url: "https://blog.test/register?invite=abc" },
  });
  await fireEvent.click(screen.getByRole("button", { name: /Create invite/ }));
  expect(await screen.findByText("https://blog.test/register?invite=abc")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
});

test("revoking removes the invite", async () => {
  await setup();
  await fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Revoke" })).toBe(null));
});

test("a settings page that can't load says so", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "GET /api/admin/signups": () => apiError(500, "Down") }).fetch);
  render(AdminSignups);
  expect((await screen.findByRole("alert")).textContent).toContain("Down");
});
