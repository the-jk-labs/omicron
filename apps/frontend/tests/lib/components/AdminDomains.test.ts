// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import AdminDomains from "#lib/components/AdminDomains.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import { apiError, fakeFetch } from "../../fakeFetch";

const bad = { domain: "bad.example", reason: "", severity: "suspend", createdAt: "2026-01-01T00:00:00Z" };

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const f = fakeFetch(routes);
  vi.stubGlobal("fetch", f.fetch);
  render(AdminDomains);
  return f;
}

test("an empty blocklist says so", async () => {
  setup({ "GET /api/admin/domains": { domains: [] } });
  await waitFor(() => screen.getByText("No domains blocked."));
});

test("blocking reports what was purged and reloads the list", async () => {
  let domains: unknown[] = [];
  const { calls } = setup({
    "GET /api/admin/domains": () => Response.json({ domains }),
    "POST /api/admin/domains": () => {
      domains = [bad];
      return Response.json({ domain: "bad.example", purged: 3 });
    },
  });
  await waitFor(() => screen.getByText("No domains blocked."));
  await fireEvent.input(screen.getByPlaceholderText("example.social"), { target: { value: " bad.example " } });
  await fireEvent.click(screen.getByRole("button", { name: "Block domain" }));
  await waitFor(() => screen.getByText("Blocked bad.example and removed 3 cached accounts."));
  await waitFor(() => screen.getByRole("button", { name: "Unblock" }));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ domain: "bad.example" });
});

test("a single purged account is singular; nothing purged is just 'Blocked'", async () => {
  setup({
    "GET /api/admin/domains": { domains: [] },
    "POST /api/admin/domains": { domain: "x.example", purged: 1 },
  });
  await waitFor(() => screen.getByText("No domains blocked."));
  await fireEvent.input(screen.getByPlaceholderText("example.social"), { target: { value: "x.example" } });
  await fireEvent.click(screen.getByRole("button", { name: "Block domain" }));
  await waitFor(() => screen.getByText("Blocked x.example and removed 1 cached account."));
});

test("refusals from the server are shown", async () => {
  setup({
    "GET /api/admin/domains": { domains: [] },
    "POST /api/admin/domains": apiError(400, "You can't block your own instance."),
  });
  await waitFor(() => screen.getByText("No domains blocked."));
  await fireEvent.input(screen.getByPlaceholderText("example.social"), { target: { value: "me.example" } });
  await fireEvent.click(screen.getByRole("button", { name: "Block domain" }));
  await waitFor(() => screen.getByText("You can't block your own instance."));
});

test("unblocking asks first", async () => {
  const { calls } = setup({
    "GET /api/admin/domains": { domains: [bad] },
    "DELETE /api/admin/domains/bad.example": { ok: true },
  });
  await waitFor(() => screen.getByRole("button", { name: "Unblock" }));
  await fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
  expect(get(confirmRequest)?.title).toBe("Unblock bad.example?");
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => screen.getByText("No domains blocked."));
  expect(calls.some((c) => c.method === "DELETE")).toBe(true);
});

test("a load failure is shown", async () => {
  setup({ "GET /api/admin/domains": apiError(403, "Moderators only") });
  await waitFor(() => screen.getByText("Moderators only"));
});

test("a limit is sent as one, purges nothing, and the list labels it", async () => {
  let domains: unknown[] = [];
  const { calls } = setup({
    "GET /api/admin/domains": () => Response.json({ domains }),
    "POST /api/admin/domains": () => {
      domains = [{ ...bad, domain: "noisy.example", severity: "limit" }];
      return Response.json({ domain: "noisy.example", purged: 0 });
    },
  });
  await waitFor(() => screen.getByText("No domains blocked."));
  await fireEvent.click(screen.getByRole("radio", { name: /Limit/ }));
  await fireEvent.input(screen.getByPlaceholderText("example.social"), { target: { value: "noisy.example" } });
  await fireEvent.click(screen.getByRole("button", { name: "Limit domain" }));
  await waitFor(() => screen.getByText("Limited noisy.example."));
  await waitFor(() => screen.getByText("Limited"));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ domain: "noisy.example", severity: "limit" });
});

test("a suspension can be eased to a limit without a prompt", async () => {
  const { calls } = setup({
    "GET /api/admin/domains": { domains: [bad] },
    "POST /api/admin/domains": { domain: "bad.example", purged: 0 },
  });
  await waitFor(() => screen.getByText("Suspended"));
  await fireEvent.click(screen.getByRole("button", { name: "Limit instead" }));
  await waitFor(() => screen.getByText("Limited"));
  expect(get(confirmRequest)?.title).not.toBe("Suspend bad.example?");
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ domain: "bad.example", severity: "limit" });
});

test("tightening a limit to a suspension asks first, since it purges", async () => {
  const { calls } = setup({
    "GET /api/admin/domains": { domains: [{ ...bad, severity: "limit" }] },
    "POST /api/admin/domains": { domain: "bad.example", purged: 2 },
  });
  await waitFor(() => screen.getByText("Limited"));
  await fireEvent.click(screen.getByRole("button", { name: "Suspend instead" }));
  expect(get(confirmRequest)?.title).toBe("Suspend bad.example?");
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => screen.getByText("Blocked bad.example and removed 2 cached accounts."));
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({ domain: "bad.example", severity: "suspend" });
});
