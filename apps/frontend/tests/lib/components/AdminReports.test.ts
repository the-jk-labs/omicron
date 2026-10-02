import AdminReports from "$lib/components/AdminReports.svelte";
import { confirmRequest } from "$lib/components/ui/confirm";
import type { Report } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import { apiError, fakeFetch } from "../../fakeFetch";

function report(overrides: Partial<Report>): Report {
  return {
    id: "r1",
    subjectType: "post",
    reason: "spam",
    status: "open",
    resolution: "",
    createdAt: "2026-01-01T00:00:00Z",
    resolvedAt: null,
    reporter: { username: "ada", displayName: "Ada" },
    postId: "9e962281-2222-3333-4444-555555555555",
    postTitle: "Buy now",
    postAuthor: "spammer",
    userId: null,
    userUsername: null,
    userDisplayName: null,
    ...overrides,
  } as Report;
}

function setup(reports: Report[], routes: Parameters<typeof fakeFetch>[0] = {}) {
  const f = fakeFetch({ "GET /api/admin/reports?status=open": { reports, openCount: reports.length }, ...routes });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminReports);
  return f;
}

test("lists open reports with subject, reporter and reason, and the open count", async () => {
  setup([
    report({}),
    report({ id: "r2", subjectType: "user", postId: null, userId: "u9", userUsername: "troll", reporter: null }),
  ]);
  await waitFor(() => screen.getByText("Buy now"));
  expect(screen.getByText("@troll")).toBeInTheDocument();
  expect(screen.getByText(/Reported by a deleted account/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Remove post" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Suspend account" })).toBeInTheDocument();
});

test("a removed subject is named as such and not linked", async () => {
  setup([
    report({ postId: null, postTitle: null }),
    report({ id: "r2", subjectType: "user", postId: null, userUsername: null }),
  ]);
  await waitFor(() => screen.getByText("Post (removed)"));
  expect(screen.getByText("Account (removed)")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Post (removed)" })).toBe(null);
});

test("dismissing resolves and reloads", async () => {
  const { calls } = setup([report({})], { "POST /api/admin/reports/r1/resolve": { ok: true } });
  await waitFor(() => screen.getByRole("button", { name: "Dismiss" }));
  await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => expect(calls.filter((c) => c.path === "/api/admin/reports?status=open")).toHaveLength(2));
});

test("removing a post confirms, removes with the notify choice, then resolves with a note", async () => {
  const P = "9e962281-2222-3333-4444-555555555555";
  const { calls } = setup([report({})], {
    [`DELETE /api/admin/posts/${P}`]: { ok: true },
    "POST /api/admin/reports/r1/resolve": { ok: true },
  });
  await waitFor(() => screen.getByRole("button", { name: "Remove post" }));
  await fireEvent.click(screen.getByRole("button", { name: "Remove post" }));
  get(confirmRequest)!.resolve({ ok: true, notify: true });
  await waitFor(() => expect(calls.some((c) => c.path.endsWith("/resolve"))).toBe(true));
  expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/api/admin/posts/${P}?notify=true`);
  expect(calls.find((c) => c.path.endsWith("/resolve"))?.body).toEqual({ resolution: "Post removed." });
});

test("suspending an account confirms first; a cancel does nothing", async () => {
  const { calls } = setup([report({ subjectType: "user", postId: null, userId: "u9", userUsername: "troll" })], {
    "POST /api/admin/users/u9/suspend": { ok: true },
    "POST /api/admin/reports/r1/resolve": { ok: true },
  });
  await waitFor(() => screen.getByRole("button", { name: "Suspend account" }));
  await fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
  expect(get(confirmRequest)?.title).toBe("Suspend @troll?");
  get(confirmRequest)!.resolve({ ok: false, notify: false });
  await Promise.resolve();
  expect(calls.some((c) => c.path.includes("/suspend"))).toBe(false);

  await fireEvent.click(screen.getByRole("button", { name: "Suspend account" }));
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() =>
    expect(calls.find((c) => c.path.includes("/suspend"))?.body).toEqual({ suspend: true, notify: false }),
  );
});

test("a failure is shown", async () => {
  setup([report({})], { "POST /api/admin/reports/r1/resolve": apiError(403, "Admins only") });
  await waitFor(() => screen.getByRole("button", { name: "Dismiss" }));
  await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  await waitFor(() => screen.getByText("Admins only"));
});
