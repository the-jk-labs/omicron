// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { expect, test, vi } from "vitest";
import AdminUsers from "#lib/components/AdminUsers.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import type { AdminUser, AdminUserDetail, DeletedUser } from "#lib/types.js";
import { apiError, fakeFetch } from "../../fakeFetch";

function user(o: Partial<AdminUser> = {}): AdminUser {
  const username = o.username ?? "ada";
  return {
    id: `u-${username}`,
    username,
    displayName: username[0].toUpperCase() + username.slice(1),
    bio: "",
    publicEmail: "",
    customSection: "",
    avatarUrl: null,
    isAdmin: false,
    isModerator: false,
    email: `${username}@example.com`,
    emailVerified: true,
    suspended: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...o,
  };
}

function detail(u: AdminUser, o: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    user: u,
    postCounts: { draft: 1, scheduled: 1, published: 3 },
    followCounts: { followers: 7, following: 2 },
    recentPosts: [],
    reports: [],
    tags: [],
    links: [],
    ...o,
  };
}

function deletedUser(o: Partial<DeletedUser> = {}): DeletedUser {
  return {
    id: "d-gone",
    username: "gone",
    displayName: "Gone",
    avatarUrl: null,
    email: "gone@example.com",
    postCount: 1,
    deletedBy: "root",
    deletedAt: "2026-01-01T00:00:00Z",
    expiresAt: new Date(Date.now() + 2.5 * 86_400_000).toISOString(),
    ...o,
  };
}

const page = (users: AdminUser[], o: { total?: number; filteredTotal?: number; nextCursor?: string | null } = {}) => ({
  users,
  total: o.total ?? users.length,
  filteredTotal: o.filteredTotal ?? users.length,
  nextCursor: o.nextCursor ?? null,
});
const noDeleted = { users: [], nextCursor: null, total: 0, filteredTotal: 0 };

const ada = user();
const bob = user({ username: "bob" });

function setup(
  routes: Parameters<typeof fakeFetch>[0] = {},
  props: { selfId?: string; isViewerAdmin?: boolean } = { isViewerAdmin: true },
) {
  const f = fakeFetch({
    "GET /api/admin/users": page([ada, bob]),
    "GET /api/admin/users/deleted": noDeleted,
    ...routes,
  });
  vi.stubGlobal("fetch", f.fetch);
  render(AdminUsers, { props: { selfId: "me", ...props } });
  return f;
}

const listCalls = (calls: { method: string; path: string }[]) =>
  calls.filter((c) => c.method === "GET" && /^\/api\/admin\/users(\?|$)/.test(c.path)).map((c) => c.path);

function deferred() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  return { promise, resolve };
}

async function openMenu(username: string, item: string) {
  const trigger = screen.getByRole("button", { name: `More actions for @${username}` });
  await fireEvent.keyDown(trigger, { key: "Enter" });
  await fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

async function confirmWith(result: { ok: boolean; notify?: boolean }) {
  await waitFor(() => expect(get(confirmRequest)).not.toBe(null));
  get(confirmRequest)!.resolve({ notify: false, ...result });
  confirmRequest.set(null);
}

test("lists accounts with their roles and the total", async () => {
  setup({
    "GET /api/admin/users": page([
      user({ isAdmin: true }),
      user({ username: "bob", isModerator: true, suspended: true }),
    ]),
  });
  await screen.findByText("2 accounts total");
  expect(screen.getByText("Admin")).toBeInTheDocument();
  expect(screen.getByText("Moderator")).toBeInTheDocument();
  expect(screen.getByText("Suspended", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByText("No deleted accounts.")).toBeInTheDocument();
});

test("the viewer's own row and, for a moderator, staff rows carry no actions", async () => {
  setup(
    { "GET /api/admin/users": page([user({ id: "me", username: "me" }), user({ isAdmin: true }), bob]) },
    { isViewerAdmin: false },
  );
  await screen.findByText("3 accounts total");
  expect(screen.queryByRole("button", { name: "More actions for @me" })).toBe(null);
  expect(screen.queryByRole("button", { name: "More actions for @ada" })).toBe(null);
  expect(screen.getByRole("button", { name: "More actions for @bob" })).toBeInTheDocument();
});

test("a moderator viewer can't hand out roles", async () => {
  setup({}, { isViewerAdmin: false });
  await screen.findByText("2 accounts total");
  const trigger = screen.getByRole("button", { name: "More actions for @bob" });
  await fireEvent.keyDown(trigger, { key: "Enter" });
  await screen.findByRole("menuitem", { name: "Edit profile…" });
  expect(screen.queryByRole("menuitem", { name: "Make admin…" })).toBe(null);
  expect(screen.queryByRole("menuitem", { name: "Make moderator…" })).toBe(null);
});

test("a failed load is shown and the table is empty", async () => {
  setup({ "GET /api/admin/users": apiError(500, "Database down") });
  await screen.findByText("Database down");
  expect(screen.getByText("No accounts found.")).toBeInTheDocument();
});

test("search is debounced, trimmed, and clearing it reloads everyone", async () => {
  const { calls } = setup();
  await screen.findByText("2 accounts total");
  const box = screen.getByRole("searchbox", { name: /Search accounts/ });
  await fireEvent.input(box, { target: { value: "a" } });
  await fireEvent.input(box, { target: { value: " ad " } });
  await waitFor(() => expect(listCalls(calls)).toEqual(["/api/admin/users", "/api/admin/users?q=ad"]));
  await screen.findByText(/2 of 2 accounts · showing 2/);
  await fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await waitFor(() => expect(listCalls(calls).at(-1)).toBe("/api/admin/users"));
});

test("filters and sort reload from page one with their query", async () => {
  const { calls } = setup();
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("radio", { name: "Status: Suspended" }));
  await waitFor(() => expect(listCalls(calls).at(-1)).toBe("/api/admin/users?suspended=true"));
  await fireEvent.click(screen.getByRole("radio", { name: "Role: Non-admins" }));
  await waitFor(() => expect(listCalls(calls).at(-1)).toBe("/api/admin/users?suspended=true&admin=false"));
  // Clicking the active segment deselects it, which means "all".
  await fireEvent.click(screen.getByRole("radio", { name: "Status: Suspended" }));
  await waitFor(() => expect(listCalls(calls).at(-1)).toBe("/api/admin/users?admin=false"));
  await fireEvent.click(screen.getByRole("radio", { name: "Sort accounts: Username" }));
  await waitFor(() => expect(listCalls(calls).at(-1)).toBe("/api/admin/users?admin=false&sort=username"));
});

test("a slow earlier response can't overwrite a newer search", async () => {
  const first = deferred();
  let n = 0;
  setup({
    "GET /api/admin/users": (req) => {
      n++;
      if (n === 1) return first.promise;
      return Response.json(page([user({ username: new URL(req.url).searchParams.get("q") ?? "x" })]));
    },
  });
  await fireEvent.input(screen.getByRole("searchbox", { name: /Search accounts/ }), { target: { value: "zed" } });
  await screen.findByText("Zed");
  first.resolve(Response.json(page([user({ username: "stale" })])));
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText("Stale")).toBe(null);
  expect(screen.getByText("Zed")).toBeInTheDocument();
});

test("load more appends the next page without duplicating rows", async () => {
  const { calls } = setup({
    "GET /api/admin/users?cursor=c1": page([bob, user({ username: "cy" })], { total: 3, filteredTotal: 3 }),
    "GET /api/admin/users": page([ada, bob], { total: 3, filteredTotal: 3, nextCursor: "c1" }),
  });
  await screen.findByText("3 accounts total · showing 2");
  await fireEvent.click(screen.getByRole("button", { name: "Load more (2 of 3)" }));
  await screen.findByText("Cy");
  expect(screen.getAllByText("Bob")).toHaveLength(1);
  expect(listCalls(calls)).toContain("/api/admin/users?cursor=c1");
  expect(screen.queryByRole("button", { name: /Load more/ })).toBe(null);
});

test("suspending confirms first and marks the row", async () => {
  const { calls } = setup({ "POST /api/admin/users/u-bob/suspend": { ok: true } });
  await screen.findByText("2 accounts total");
  const [, bobSuspend] = screen.getAllByRole("button", { name: "Suspend" });
  await fireEvent.click(bobSuspend);
  expect(get(confirmRequest)?.title).toBe("Suspend @bob?");
  await confirmWith({ ok: false });
  expect(calls.some((c) => c.path.endsWith("/suspend"))).toBe(false);

  await fireEvent.click(bobSuspend);
  await confirmWith({ ok: true, notify: true });
  await screen.findByRole("button", { name: "Reinstate" });
  expect(calls.find((c) => c.path.endsWith("/suspend"))?.body).toEqual({ suspend: true, notify: true });
  expect(screen.getByText("Suspended", { selector: "span" })).toBeInTheDocument();
});

test("suspending under the Active filter drops the row", async () => {
  setup({ "POST /api/admin/users/u-bob/suspend": { ok: true } });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("radio", { name: "Status: Active" }));
  await screen.findByText(/2 of 2 accounts/);
  await fireEvent.click(screen.getAllByRole("button", { name: "Suspend" })[1]);
  await confirmWith({ ok: true });
  await waitFor(() => expect(screen.queryByText("Bob")).toBe(null));
  expect(screen.getByText(/1 of 2 accounts · showing 1/)).toBeInTheDocument();
});

test("a failed suspend is shown", async () => {
  setup({ "POST /api/admin/users/u-bob/suspend": apiError(403, "Not allowed") });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getAllByRole("button", { name: "Suspend" })[1]);
  await confirmWith({ ok: true });
  await screen.findByText("Not allowed");
});

test("deleting needs the typed username and a password, then moves the account to Recently deleted", async () => {
  let deletedOnce = false;
  const { calls } = setup({
    "POST /api/admin/users/u-bob/delete": () => {
      deletedOnce = true;
      return Response.json({ ok: true });
    },
    "GET /api/admin/users/deleted": () =>
      Response.json(
        deletedOnce
          ? {
              users: [deletedUser({ id: "u-bob", username: "bob", displayName: "Bob" })],
              nextCursor: null,
              total: 1,
              filteredTotal: 1,
            }
          : noDeleted,
      ),
  });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Delete…");
  const confirmBtn = await screen.findByRole("button", { name: "Delete this account" });
  expect(confirmBtn).toBeDisabled();
  await fireEvent.input(screen.getByLabelText(/to confirm/), { target: { value: "Bob" } });
  await fireEvent.input(screen.getByLabelText("Your password"), { target: { value: "pw" } });
  expect(confirmBtn).toBeDisabled();
  await fireEvent.input(screen.getByLabelText(/to confirm/), { target: { value: " bob " } });
  expect(confirmBtn).toBeEnabled();
  await fireEvent.click(screen.getByRole("checkbox", { name: "Notify @bob by email." }));
  await fireEvent.click(confirmBtn);
  await screen.findByText("Recently deleted (1). Restorable until the retention window ends");
  expect(calls.find((c) => c.path.endsWith("/delete"))?.body).toEqual({
    username: "bob",
    password: "pw",
    notify: false,
  });
  expect(screen.getByText("1 account total")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete this account" })).toBe(null);
});

test("a refused delete keeps the dialog open with the reason", async () => {
  setup({ "POST /api/admin/users/u-bob/delete": apiError(403, "Wrong password") });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Delete…");
  await fireEvent.input(await screen.findByLabelText(/to confirm/), { target: { value: "bob" } });
  await fireEvent.input(screen.getByLabelText("Your password"), { target: { value: "nope" } });
  await fireEvent.click(screen.getByRole("button", { name: "Delete this account" }));
  await screen.findByText("Wrong password");
  expect(screen.getByText("Bob")).toBeInTheDocument();
});

test("making an admin re-verifies the password and updates the row", async () => {
  const { calls } = setup({ "POST /api/admin/users/u-bob/role": { ok: true } });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Make admin…");
  await screen.findByText("Make @bob an admin?");
  const save = screen.getByRole("button", { name: "Make admin" });
  expect(save).toBeDisabled();
  await fireEvent.input(screen.getByLabelText("Your password"), { target: { value: "pw" } });
  await fireEvent.click(save);
  await waitFor(() => expect(screen.queryByText("Make @bob an admin?")).toBe(null));
  expect(calls.find((c) => c.path.endsWith("/role"))?.body).toEqual({ makeAdmin: true, password: "pw", notify: true });
  expect(screen.getByText("Admin")).toBeInTheDocument();
});

test("promoting under the Non-admins filter drops the row", async () => {
  setup({ "POST /api/admin/users/u-bob/role": { ok: true } });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("radio", { name: "Role: Non-admins" }));
  await screen.findByText(/2 of 2 accounts/);
  await openMenu("bob", "Make admin…");
  await fireEvent.input(await screen.findByLabelText("Your password"), { target: { value: "pw" } });
  await fireEvent.click(screen.getByRole("button", { name: "Make admin" }));
  await waitFor(() => expect(screen.queryByText("Bob")).toBe(null));
});

test("removing a moderator role and a failed role change", async () => {
  const { calls } = setup({
    "GET /api/admin/users": page([user({ username: "bob", isModerator: true }), ada]),
    "POST /api/admin/users/u-bob/moderator-role": { ok: true },
    "POST /api/admin/users/u-ada/moderator-role": apiError(400, "Wrong password"),
  });
  await screen.findByText("Moderator");
  await openMenu("bob", "Remove moderator…");
  await screen.findByText("Remove @bob's moderator role?");
  await fireEvent.input(screen.getByLabelText("Your password"), { target: { value: "pw" } });
  await fireEvent.click(screen.getByRole("button", { name: "Remove moderator" }));
  await waitFor(() => expect(screen.queryByText("Moderator")).toBe(null));
  expect(calls.find((c) => c.path.includes("u-bob/moderator-role"))?.body).toMatchObject({ makeModerator: false });

  await openMenu("ada", "Make moderator…");
  await fireEvent.input(await screen.findByLabelText("Your password"), { target: { value: "pw" } });
  await fireEvent.click(screen.getByRole("button", { name: "Make moderator" }));
  await screen.findByText("Wrong password");
});

test("expanding a row loads its detail once and caches it", async () => {
  const { calls } = setup({
    "GET /api/admin/users/u-bob": detail(bob, {
      recentPosts: [{ id: "p1", title: null, slug: null, status: "draft", createdAt: "2026-01-02T00:00:00Z" }],
    }),
  });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await screen.findByText("followers");
  expect(screen.getByText("Untitled")).toBeInTheDocument();
  expect(screen.getByText("Nothing filed against this account.")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Hide detail for @bob" }));
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await screen.findByText("followers");
  expect(calls.filter((c) => c.path === "/api/admin/users/u-bob")).toHaveLength(1);
});

test("a failed detail load shows inline, and re-expanding retries", async () => {
  let n = 0;
  setup({
    "GET /api/admin/users/u-bob": () => (++n === 1 ? apiError(500, "Detail broke") : Response.json(detail(bob))),
  });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await screen.findByText("Detail broke");
  await fireEvent.click(screen.getByRole("button", { name: "Hide detail for @bob" }));
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await screen.findByText("followers");
  expect(screen.queryByText("Detail broke")).toBe(null);
});

test("an unverified account can be sent a new link or marked verified", async () => {
  const unverified = user({ username: "bob", emailVerified: false });
  const { calls } = setup({
    "GET /api/admin/users": page([ada, unverified]),
    "GET /api/admin/users/u-bob": detail(unverified),
    "POST /api/admin/users/u-bob/verification-email": { ok: true },
    "POST /api/admin/users/u-bob/verify": { ok: true },
  });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Resend email" }));
  await screen.findByText("Verification email sent.");

  await fireEvent.click(screen.getByRole("button", { name: "Mark verified" }));
  await confirmWith({ ok: true });
  await screen.findByText("Email marked verified.");
  expect(screen.getByText("Email verified")).toBeInTheDocument();
  expect(calls.some((c) => c.path.endsWith("/verify"))).toBe(true);
});

test("marking verified under the Unverified filter drops the row", async () => {
  const unverified = user({ username: "bob", emailVerified: false });
  setup({
    "GET /api/admin/users": page([unverified]),
    "GET /api/admin/users/u-bob": detail(unverified),
    "POST /api/admin/users/u-bob/verify": { ok: true },
  });
  await screen.findByText("1 account total");
  await fireEvent.click(screen.getByRole("radio", { name: "Email: Unverified" }));
  await screen.findByText(/1 of 1 account/);
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Mark verified" }));
  await confirmWith({ ok: true });
  await screen.findByText("No accounts match.");
});

test("verification failures show in the row's detail", async () => {
  const unverified = user({ username: "bob", emailVerified: false });
  setup({
    "GET /api/admin/users": page([unverified]),
    "GET /api/admin/users/u-bob": detail(unverified),
    "POST /api/admin/users/u-bob/verification-email": apiError(503, "Mail is off"),
  });
  await fireEvent.click(await screen.findByRole("button", { name: "Show detail for @bob" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Resend email" }));
  await screen.findByText("Mail is off");
  // The panel stays up; the error doesn't replace it.
  expect(screen.getByText("followers")).toBeInTheDocument();
});

test("removing a post from the detail updates its count bucket", async () => {
  const { calls } = setup({
    "GET /api/admin/users/u-bob": detail(bob, {
      postCounts: { draft: 0, scheduled: 0, published: 2 },
      recentPosts: [{ id: "p1", title: "Spam", slug: "spam", status: "published", createdAt: "2026-01-02T00:00:00Z" }],
    }),
    "DELETE /api/admin/posts/p1": { ok: true },
  });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await fireEvent.click(await screen.findByRole("button", { name: "Remove “Spam”" }));
  await confirmWith({ ok: true, notify: true });
  await screen.findByText("Post removed.");
  expect(screen.getByText("No posts yet.")).toBeInTheDocument();
  expect(screen.getByText("1").nextSibling?.textContent).toContain("published");
  expect(calls.find((c) => c.method === "DELETE")?.path).toBe("/api/admin/posts/p1?notify=true");
});

test("an open report can be resolved from the detail", async () => {
  const report = {
    id: "r1",
    subjectType: "user",
    reason: "",
    status: "open",
    resolution: "",
    createdAt: "2026-01-01T00:00:00Z",
    resolvedAt: null,
    reporter: null,
    postId: null,
    postTitle: null,
    postAuthor: null,
    userId: "u-bob",
    userUsername: "bob",
    userDisplayName: "Bob",
  } as unknown as AdminUserDetail["reports"][number];
  const { calls } = setup({
    "GET /api/admin/users/u-bob": detail(bob, { reports: [report] }),
    "POST /api/admin/reports/r1/resolve": { ok: true },
  });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await screen.findByText(/No reason given · by a deleted account/);
  await fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
  await confirmWith({ ok: true });
  await screen.findByText("Report resolved.");
  expect(screen.getByText("resolved")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Resolve" })).toBe(null);
  expect(calls.find((c) => c.path.endsWith("/resolve"))?.body).toEqual({});
});

test("edit is seeded from the detail and saves only what changed", async () => {
  const withProfile = user({ username: "bob", bio: "Old bio" });
  const { calls } = setup({
    "GET /api/admin/users/u-bob": detail(withProfile, {
      tags: [{ slug: "deno", name: "deno" }],
      links: [{ platform: "github", url: "https://github.com/bob", label: "" }],
    }),
    "PATCH /api/admin/users/u-bob": (req) =>
      req.json().then((b: Partial<AdminUser>) => Response.json({ user: { ...withProfile, ...b } })),
  });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Edit profile…");
  await screen.findByText("Edit @bob");
  await waitFor(() => expect(screen.getByLabelText("Bio")).toHaveValue("Old bio"));
  expect(screen.getByRole("button", { name: "Remove tag deno" })).toBeInTheDocument();
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save).toBeDisabled();

  await fireEvent.input(screen.getByLabelText("Display name"), { target: { value: "  Robert  " } });
  expect(save).toBeEnabled();
  await fireEvent.click(save);
  await screen.findByText("Saved.");
  // Only the changed field: the untouched tags and links aren't rewritten.
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ displayName: "Robert" });
  expect(screen.getByText("Robert")).toBeInTheDocument();
  expect(screen.queryByText("Edit @bob")).toBe(null);
});

test("changing the login email says a verification link went out", async () => {
  const { calls } = setup({
    "GET /api/admin/users/u-bob": detail(bob),
    "PATCH /api/admin/users/u-bob": { user: { ...bob, email: "new@example.com" } },
  });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Edit profile…");
  await waitFor(() => expect(screen.getByLabelText("Login email")).toHaveValue("bob@example.com"));
  await fireEvent.input(screen.getByLabelText("Login email"), { target: { value: "new@example.com" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(/Login email updated. A verification link was sent/);
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ email: "new@example.com" });
});

test.for([
  ["Display name", "   ", "Display name must be 1–60 characters."],
  ["Login email", "not-an-email", "Enter a valid login email address."],
  ["Public email", "half@", "Enter a valid public email address, or leave it blank."],
] as const)("edit refuses a bad %s before any request", async ([label, value, message]) => {
  const { calls } = setup({ "GET /api/admin/users/u-bob": detail(bob) });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Edit profile…");
  await waitFor(() => expect(screen.getByLabelText("Login email")).toHaveValue("bob@example.com"));
  await fireEvent.input(screen.getByLabelText(label), { target: { value } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(message);
  expect(calls.some((c) => c.method === "PATCH")).toBe(false);
});

test("a refused edit keeps the dialog open with the reason", async () => {
  setup({
    "GET /api/admin/users/u-bob": detail(bob),
    "PATCH /api/admin/users/u-bob": apiError(409, "Email already in use"),
  });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Edit profile…");
  await waitFor(() => expect(screen.getByLabelText("Bio")).toHaveValue(""));
  await fireEvent.input(screen.getByLabelText("Bio"), { target: { value: "Hi" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Email already in use");
  expect(screen.getByText("Edit @bob")).toBeInTheDocument();
});

test("editing while the row's detail is loading keeps its existing tags", async () => {
  const slow = deferred();
  const { calls } = setup({
    "GET /api/admin/users/u-bob": () => slow.promise,
    "PATCH /api/admin/users/u-bob": { user: bob },
  });
  await screen.findByText("2 accounts total");
  await fireEvent.click(screen.getByRole("button", { name: "Show detail for @bob" }));
  await openMenu("bob", "Edit profile…");
  await screen.findByText("Edit @bob");
  slow.resolve(Response.json(detail(bob, { tags: [{ slug: "deno", name: "deno" }] })));
  await screen.findByText("followers");
  const tags = screen.getByPlaceholderText(/^Add (tags|another tag)/);
  await fireEvent.input(tags, { target: { value: "svelte" } });
  await fireEvent.keyDown(tags, { key: "Enter" });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ tags: ["deno", "svelte"] });
});

// Without the detail the tags and links are unknown; saving [] would wipe them.
test("when the detail can't load, edit hides tags and links and never sends them", async () => {
  const { calls } = setup({
    "GET /api/admin/users/u-bob": apiError(500, "Detail down"),
    "PATCH /api/admin/users/u-bob": (req) =>
      req.json().then((b: Partial<AdminUser>) => Response.json({ user: { ...bob, ...b } })),
  });
  await screen.findByText("2 accounts total");
  await openMenu("bob", "Edit profile…");
  await screen.findByText("Detail down");
  expect(screen.getByText(/Tags and links couldn't be loaded/)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/^Add (tags|another tag)/)).toBe(null);
  await fireEvent.input(screen.getByLabelText("Display name"), { target: { value: "Robert" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ displayName: "Robert" });
});

test("recently deleted accounts show who deleted them and the days left", async () => {
  setup({
    "GET /api/admin/users/deleted": { users: [deletedUser()], nextCursor: null, total: 1, filteredTotal: 1 },
  });
  await screen.findByText("Gone");
  expect(screen.getByText(/@gone · gone@example.com · 1\s+post kept/)).toBeInTheDocument();
  expect(screen.getByText(/by @root/)).toBeInTheDocument();
  expect(screen.getByText(/3\s+days left/)).toBeInTheDocument();
});

test("restoring confirms, removes it from the deleted list and reloads the table", async () => {
  const { calls } = setup({
    "GET /api/admin/users/deleted": { users: [deletedUser()], nextCursor: null, total: 1, filteredTotal: 1 },
    "POST /api/admin/users/d-gone/restore": { ok: true },
  });
  await screen.findByText("Gone");
  const before = listCalls(calls).length;
  await fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  expect(get(confirmRequest)?.title).toBe("Restore @gone?");
  await confirmWith({ ok: true, notify: true });
  await screen.findByText("No deleted accounts.");
  expect(calls.find((c) => c.path.endsWith("/restore"))?.body).toEqual({ notify: true });
  expect(listCalls(calls).length).toBe(before + 1);
});

test("erasing confirms; a failure is shown under the deleted list", async () => {
  setup({
    "GET /api/admin/users/deleted": { users: [deletedUser()], nextCursor: null, total: 1, filteredTotal: 1 },
    "DELETE /api/admin/users/deleted/d-gone": apiError(500, "Erase failed badly"),
  });
  await screen.findByText("Gone");
  await fireEvent.click(screen.getByRole("button", { name: "Erase" }));
  expect(get(confirmRequest)?.title).toBe("Erase @gone forever?");
  await confirmWith({ ok: true });
  await screen.findByText("Erase failed badly");
  expect(screen.getByText("Gone")).toBeInTheDocument();
});

// Erasing skips the restore window, so the server allows it to admins only.
test("a moderator can restore a deleted account but is not offered Erase", async () => {
  setup(
    { "GET /api/admin/users/deleted": { users: [deletedUser()], nextCursor: null, total: 1, filteredTotal: 1 } },
    { isViewerAdmin: false },
  );
  await screen.findByText("Gone");
  expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Erase" })).toBeNull();
});

test("the deleted list searches and pages on its own", async () => {
  const { calls } = setup({
    "GET /api/admin/users/deleted?cursor=d1": {
      users: [deletedUser({ id: "d2", username: "two", displayName: "Two" })],
      nextCursor: null,
      total: 2,
      filteredTotal: 2,
    },
    "GET /api/admin/users/deleted": { users: [deletedUser()], nextCursor: "d1", total: 2, filteredTotal: 2 },
  });
  await screen.findByText("Gone");
  await fireEvent.click(screen.getByRole("button", { name: "Load more (1 of 2)" }));
  await screen.findByText("Two");
  await fireEvent.input(screen.getByRole("searchbox", { name: /Search deleted/ }), { target: { value: "go" } });
  await waitFor(() => expect(calls.some((c) => c.path === "/api/admin/users/deleted?q=go")).toBe(true));
  await fireEvent.click(screen.getByRole("button", { name: "Clear deleted search" }));
  await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/admin/users/deleted"));
});

test("erasing a searched-for account keeps the search count honest", async () => {
  setup({
    "GET /api/admin/users/deleted": { users: [deletedUser()], nextCursor: null, total: 1, filteredTotal: 1 },
    "DELETE /api/admin/users/deleted/d-gone": { ok: true },
  });
  await screen.findByText("Gone");
  await fireEvent.input(screen.getByRole("searchbox", { name: /Search deleted/ }), { target: { value: "gone" } });
  await screen.findByText(/1 of 1 account/);
  await fireEvent.click(screen.getByRole("button", { name: "Erase" }));
  await confirmWith({ ok: true });
  await screen.findByText("No deleted accounts match.");
  expect(screen.getByText(/0 of 0 accounts · showing 0/)).toBeInTheDocument();
});

test("a failed deleted-list load is shown", async () => {
  setup({ "GET /api/admin/users/deleted": apiError(500, "Deleted list broke") });
  await screen.findByText("Deleted list broke");
  expect(
    within(screen.getByText("Deleted list broke").parentElement!).getByText("No deleted accounts."),
  ).toBeInTheDocument();
});
