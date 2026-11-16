// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import AdminFederation from "#lib/components/AdminFederation.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import type { FederatedInstance, FederationOverview } from "#lib/types.js";
import { apiError, fakeFetch } from "../../fakeFetch";

const HOUR = 3_600_000;

function instance(overrides: Partial<FederatedInstance> = {}): FederatedInstance {
  return {
    domain: "omicron.blog",
    source: "fedidb",
    autoCache: true,
    software: "omicron",
    softwareVersion: "0.1.0",
    nodeName: "Omicron",
    userCount: 68,
    activeMonth: 38,
    localPosts: 53,
    status: "ok",
    lastError: null,
    consecutiveFailures: 0,
    actorsSynced: 20,
    postsSynced: 140,
    lastSyncedAt: new Date(Date.now() - HOUR).toISOString(),
    lastSuccessAt: new Date(Date.now() - HOUR).toISOString(),
    nextSyncAt: new Date(Date.now() + 5 * HOUR).toISOString(),
    syncing: false,
    cachedAccounts: 20,
    cachedPosts: 140,
    createdAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

function overview(overrides: Partial<FederationOverview> = {}): FederationOverview {
  return {
    running: true,
    settings: { autoCache: true, fedidbDiscovery: true, syncIntervalHours: 6, authorsPerInstance: 20 },
    discovery: { at: new Date(Date.now() - 2 * HOUR).toISOString(), ok: true, found: 2, added: 0, error: null },
    instances: [instance()],
    ...overrides,
  };
}

function setup(routes: Parameters<typeof fakeFetch>[0], initial: FederationOverview | null = overview()) {
  const f = fakeFetch(routes);
  vi.stubGlobal("fetch", f.fetch);
  render(AdminFederation, { initial });
  return f;
}

const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent?.trim();
const row = (domain: string) => screen.getByRole("link", { name: domain }).closest("li")!;

test("loads the overview when the server didn't, and shows the network at a glance", async () => {
  setup(
    {
      "GET /api/admin/federation": overview({
        instances: [instance(), instance({ domain: "akifzada.com", cachedAccounts: 1, cachedPosts: 0 })],
      }),
    },
    null,
  );
  await waitFor(() => screen.getByRole("link", { name: "omicron.blog" }));
  expect(stat("Tracked instances")).toBe("2");
  expect(stat("Cached accounts")).toBe("21");
  expect(stat("Cached posts")).toBe("140");
  expect(within(row("omicron.blog")).getByText("Synced")).toBeInTheDocument();
  expect(within(row("omicron.blog")).getByText("FediDB")).toBeInTheDocument();
  expect(
    within(row("omicron.blog")).getByText(/Omicron · omicron 0\.1\.0 · 68 users · 38 active this month/),
  ).toBeInTheDocument();
  expect(screen.getByText(/2 instances listed/)).toBeInTheDocument();
});

test("each status reads as what it means", () => {
  setup(
    {},
    overview({
      instances: [
        instance({ domain: "a.example", status: "pending", lastSuccessAt: null }),
        instance({ domain: "b.example", status: "unsupported", software: "mastodon", lastError: "Runs mastodon" }),
        instance({ domain: "c.example", status: "error", consecutiveFailures: 3, lastError: "HTTP 503" }),
        instance({ domain: "d.example", autoCache: false }),
        instance({ domain: "e.example", syncing: true }),
      ],
    }),
  );
  expect(within(row("a.example")).getByText("Waiting")).toBeInTheDocument();
  expect(within(row("b.example")).getByText("Other software")).toBeInTheDocument();
  expect(within(row("c.example")).getByText("Failing")).toBeInTheDocument();
  expect(within(row("c.example")).getByText("HTTP 503")).toHaveClass("text-destructive");
  expect(within(row("d.example")).getByText("Paused")).toBeInTheDocument();
  expect(within(row("e.example")).getByText("Syncing")).toBeInTheDocument();
  expect(within(row("e.example")).getByRole("button", { name: "Sync now" })).toBeDisabled();
});

test("the switches save at once, and FediDB discovery depends on auto-cache", async () => {
  const { calls } = setup({
    "PATCH /api/admin/federation/settings": async (req) =>
      Response.json({ ...overview().settings, ...((await req.json()) as object) }),
  });
  await fireEvent.click(screen.getByRole("switch", { name: "Auto-cache the network" }));
  await waitFor(() =>
    expect(screen.getByRole("switch", { name: "Discover Omicron instances on FediDB" })).toBeDisabled(),
  );
  expect(calls.at(-1)?.body).toEqual({ autoCache: false });
});

test("a failed save puts the switch back", async () => {
  setup({ "PATCH /api/admin/federation/settings": apiError(500, "Database down") });
  const sw = screen.getByRole("switch", { name: "Discover Omicron instances on FediDB" });
  await fireEvent.click(sw);
  await waitFor(() => screen.getByText("Database down"));
  expect(sw).toHaveAttribute("aria-checked", "true");
});

test("interval and writer cap save together, only when changed", async () => {
  const { calls } = setup({
    "PATCH /api/admin/federation/settings": async (req) =>
      Response.json({ ...overview().settings, ...((await req.json()) as object) }),
  });
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();
  await fireEvent.input(screen.getByLabelText("Sync every (hours)"), { target: { value: "12" } });
  await fireEvent.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  expect(calls.at(-1)?.body).toEqual({ syncIntervalHours: 12, authorsPerInstance: 20 });
});

test("adding an instance lists it and says what happens next", async () => {
  const { calls } = setup({
    "POST /api/admin/federation/instances": {
      instance: instance({ domain: "new.example", source: "manual", status: "pending", lastSuccessAt: null }),
    },
  });
  await fireEvent.input(screen.getByPlaceholderText("blog.example.social"), { target: { value: " new.example " } });
  await fireEvent.click(screen.getByRole("button", { name: "Add instance" }));
  await waitFor(() => screen.getByText(/Tracking new.example/));
  expect(within(row("new.example")).getByText("Added by hand")).toBeInTheDocument();
  expect(calls.at(-1)?.body).toEqual({ domain: "new.example" });
});

test("a refused instance shows the server's reason", async () => {
  setup({ "POST /api/admin/federation/instances": apiError(400, "bad.example is suspended under Domain blocks.") });
  await fireEvent.input(screen.getByPlaceholderText("blog.example.social"), { target: { value: "bad.example" } });
  await fireEvent.click(screen.getByRole("button", { name: "Add instance" }));
  await waitFor(() => screen.getByText("bad.example is suspended under Domain blocks."));
});

test("Sync now reports what it refreshed", async () => {
  setup({
    "POST /api/admin/federation/instances/omicron.blog/sync": {
      instance: instance({ actorsSynced: 3, postsSynced: 12 }),
    },
  });
  await fireEvent.click(within(row("omicron.blog")).getByRole("button", { name: "Sync now" }));
  await waitFor(() => screen.getByText("Synced omicron.blog: 3 writers, 12 posts refreshed."));
});

test("pausing one instance goes through its own switch", async () => {
  const { calls } = setup({
    "PATCH /api/admin/federation/instances/omicron.blog": { instance: instance({ autoCache: false }) },
  });
  await fireEvent.click(within(row("omicron.blog")).getByRole("switch", { name: "Auto-cache omicron.blog" }));
  await waitFor(() => within(row("omicron.blog")).getByText("Paused"));
  expect(calls.at(-1)?.body).toEqual({ autoCache: false });
});

test("only hand-added instances can be removed, after confirming", async () => {
  setup(
    { "DELETE /api/admin/federation/instances/mine.example": { ok: true } },
    overview({ instances: [instance(), instance({ domain: "mine.example", source: "manual" })] }),
  );
  expect(within(row("omicron.blog")).queryByRole("button", { name: /Remove/ })).toBe(null);
  await fireEvent.click(within(row("mine.example")).getByRole("button", { name: "Remove mine.example" }));
  expect(get(confirmRequest)?.title).toBe("Stop tracking mine.example?");
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => expect(screen.queryByRole("link", { name: "mine.example" })).toBe(null));
});

test("Check FediDB now reports the run and reloads", async () => {
  const { calls } = setup({
    "POST /api/admin/federation/discover": { at: new Date().toISOString(), ok: true, found: 3, added: 1, error: null },
    "GET /api/admin/federation": overview(),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Check FediDB now" }));
  await waitFor(() => screen.getByText("FediDB lists 3 Omicron instances. Added 1 new."));
  expect(calls.some((c) => c.method === "GET" && c.path === "/api/admin/federation")).toBe(true);
});

test("an unreachable directory is explained, not hidden", async () => {
  setup({
    "POST /api/admin/federation/discover": {
      at: new Date().toISOString(),
      ok: false,
      found: 0,
      added: 0,
      error: "HTTP 521",
    },
    "GET /api/admin/federation": overview(),
  });
  await fireEvent.click(screen.getByRole("button", { name: "Check FediDB now" }));
  await waitFor(() => screen.getByText(/FediDB couldn't be read: HTTP 521/));
});

test("with federation off it says how to turn it on and disables network actions", () => {
  setup({}, overview({ running: false }));
  expect(screen.getByText(/Federation is off on this instance/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Check FediDB now" })).toBeDisabled();
  expect(within(row("omicron.blog")).getByRole("button", { name: "Sync now" })).toBeDisabled();
});

test("an empty network invites the first instance", () => {
  setup({}, overview({ instances: [] }));
  expect(screen.getByText("No instances tracked yet.")).toBeInTheDocument();
  expect(screen.getByText(/or let FediDB discovery fill this in/)).toBeInTheDocument();
});

test("a long list can be filtered", async () => {
  setup({}, overview({ instances: Array.from({ length: 8 }, (_, i) => instance({ domain: `site${i}.example` })) }));
  await fireEvent.input(screen.getByLabelText("Filter instances"), { target: { value: "site3" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  await fireEvent.input(screen.getByLabelText("Filter instances"), { target: { value: "nothing" } });
  expect(screen.getByText(/No instance matches/)).toBeInTheDocument();
});
