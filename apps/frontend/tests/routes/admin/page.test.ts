// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminPage from "../../../src/routes/admin/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

function setup(user: { isAdmin: boolean; isModerator: boolean }) {
  vi.stubGlobal("fetch", fakeFetch({ "*": apiError(404) }).fetch);
  render(AdminPage, { props: { data: { user: { id: "me", username: "me", ...user } } as never } });
}

// Page-level tabs and panel; AdminReports nests its own tabs inside, and hidden
// panels stay mounted, so queries are scoped to what's on screen.
const pageTabs = () => within(screen.getAllByRole("tablist")[0]).getAllByRole("tab");
const panel = () => within(screen.getAllByRole("tabpanel")[0]);

async function openTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  await fireEvent.mouseDown(tab);
  await fireEvent.click(tab);
}

test("an admin gets the full dashboard, opening on Reports", () => {
  setup({ isAdmin: true, isModerator: false });
  expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBeInTheDocument();
  expect(pageTabs().map((t) => t.textContent?.trim())).toEqual([
    "Reports",
    "Users",
    "Federation",
    "Email",
    "Security",
    "Discoverability",
    "Media",
    "Instance",
  ]);
  expect(screen.getByRole("heading", { name: "Moderation queue" })).toBeInTheDocument();
});

test.for([
  ["Federation", "Defederation"],
  ["Email", "Email delivery"],
  ["Security", "Security"],
  ["Discoverability", "Discoverability"],
  ["Media", "Photo search"],
  ["Instance", "Instance identity"],
])("an admin's %s tab shows its controls", async ([tab, heading]) => {
  setup({ isAdmin: true, isModerator: false });
  await openTab(tab);
  expect(panel().getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
  expect(panel().queryByText(/This tab requires the admin role/)).toBe(null);
});

test("a moderator's dashboard is titled Moderation and gates admin-only tabs", async () => {
  setup({ isAdmin: false, isModerator: true });
  expect(screen.getByRole("heading", { level: 1, name: "Moderation" })).toBeInTheDocument();
  await openTab("Email");
  expect(panel().getByRole("heading", { level: 2, name: "Email delivery" })).toBeInTheDocument();
  expect(panel().getByText(/This tab requires the admin role/)).toBeInTheDocument();
  await openTab("Users");
  expect(panel().getByRole("heading", { level: 2, name: "Users" })).toBeInTheDocument();
  expect(panel().queryByText(/This tab requires the admin role/)).toBe(null);
});
