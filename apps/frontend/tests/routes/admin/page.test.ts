// SPDX-License-Identifier: AGPL-3.0-or-later
import { replaceState } from "$app/navigation";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import AdminPage from "../../../src/routes/admin/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

let api: ReturnType<typeof fakeFetch>;
function setup(user: { isAdmin: boolean; isModerator: boolean }, tab = "reports", initial = {}) {
  api = fakeFetch({ "*": apiError(404) });
  vi.stubGlobal("fetch", api.fetch);
  render(AdminPage, { props: { data: { user: { id: "me", username: "me", ...user }, tab, initial } as never } });
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

test("the page opens on the tab it was loaded with, and a switch is kept in ?tab=", async () => {
  setup({ isAdmin: true, isModerator: false }, "email");
  expect(panel().getByRole("heading", { level: 2, name: "Email delivery" })).toBeInTheDocument();
  await openTab("Security");
  expect(replaceState).toHaveBeenLastCalledWith("?tab=security", {});
});

test("the open tab renders the server's data instead of loading it again", () => {
  const report = {
    id: "r1",
    subjectType: "user",
    reason: "Spam everywhere",
    status: "open",
    resolution: "",
    createdAt: "2026-01-01T00:00:00Z",
    resolvedAt: null,
    reporter: null,
    postId: null,
    postTitle: null,
    postAuthor: null,
    userId: "u2",
    userUsername: "spammer",
    userDisplayName: "Spammer",
  };
  setup({ isAdmin: true, isModerator: false }, "reports", { reports: { reports: [report], openCount: 1 } });
  expect(panel().getByText("Spam everywhere")).toBeInTheDocument();
  expect(panel().queryByText("Loading…")).toBe(null);
  expect(api.calls.filter((c) => c.path.startsWith("/api/admin/reports"))).toEqual([]);
});

const listed = { users: [], nextCursor: null, total: 0, filteredTotal: 0 };
test.for([
  ["users", "/api/admin/users", { users: { users: listed, deleted: listed } }],
  ["federation", "/api/admin/domains", { domains: { domains: [] } }],
  [
    "email",
    "/api/admin/email",
    {
      email: {
        mode: "console",
        from: "",
        smtp: { host: null, port: 587, username: null, tls: false, hasPassword: false },
        relay: { hasApiKey: false },
        dkim: { domain: null, selector: "omicron", hasKey: false },
      },
    },
  ],
  ["security", "/api/admin/security", { security: { anubisProtection: true, anubisManaged: true } }],
  [
    "discoverability",
    "/api/admin/seo",
    { seo: { indexingEnabled: true, verification: {}, indexNowEnabled: false, indexNowKey: null } },
  ],
  ["media", "/api/admin/unsplash", { unsplash: { configured: true } }],
  [
    "settings",
    "/api/admin/instance",
    {
      instance: {
        identity: {
          appName: "Omicron",
          appDomain: "blog.example",
          federationEnabled: true,
          federationRunning: true,
          sessionSecretManaged: false,
          bannerText: "",
          bannerImageUrl: null,
        },
        settings: { onInstanceViews: true },
      },
    },
  ],
] as const)("the %s tab uses the server's data", ([tab, path, initial]) => {
  setup({ isAdmin: true, isModerator: false }, tab, initial);
  expect(panel().queryByText("Loading…")).toBe(null);
  expect(api.calls.filter((c) => c.path === path || c.path.startsWith(`${path}?`))).toEqual([]);
});
