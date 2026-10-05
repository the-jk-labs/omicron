// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
import SessionsManager from "#lib/components/SessionsManager.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";
import { freshSignIn } from "#lib/freshSignIn.svelte.js";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  listSessions: vi.fn<() => Promise<Res>>(),
  getSession: vi.fn<() => Promise<Res>>(),
  revokeSession: vi.fn<(a: unknown) => Promise<Res>>(),
  revokeOtherSessions: vi.fn<() => Promise<Res>>(),
  signIn: vi.fn<(a: unknown) => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    listSessions: auth.listSessions,
    getSession: auth.getSession,
    revokeSession: auth.revokeSession,
    revokeOtherSessions: auth.revokeOtherSessions,
    signIn: { username: auth.signIn },
  },
}));

const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const LINUX_FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0";

const session = (token: string, userAgent: string, updatedAt: string, ipAddress = "203.0.113.7") => ({
  id: `id-${token}`,
  token,
  userAgent,
  ipAddress,
  createdAt: "2026-09-01T10:00:00Z",
  updatedAt,
  expiresAt: "2026-11-01T10:00:00Z",
});

const sessions = [
  session("phone", IPHONE_SAFARI, "2026-09-20T10:00:00Z"),
  session("laptop", LINUX_FIREFOX, "2026-09-25T10:00:00Z"),
  session("mine", WINDOWS_CHROME, "2026-09-10T10:00:00Z"),
];

const show = () => render(SessionsManager, { props: { username: "ada" } });
const row = (name: string) => screen.getByText(name).closest("li")!;
const labels = () => screen.getAllByRole("listitem").map((li) => li.querySelector(".font-medium")?.textContent);

beforeEach(() => {
  confirmRequest.set(null);
  auth.listSessions.mockResolvedValue({ data: sessions, error: null });
  auth.getSession.mockResolvedValue({ data: { session: { token: "mine" } }, error: null });
  auth.revokeSession.mockResolvedValue({ data: { status: true }, error: null });
  auth.revokeOtherSessions.mockResolvedValue({ data: { status: true }, error: null });
});

test("lists each device, this one first and badged, the rest by last activity", async () => {
  show();
  await screen.findByText("Chrome on Windows");
  expect(labels()).toEqual(["Chrome on Windows", "Firefox on Linux", "Safari on iOS"]);
  expect(within(row("Chrome on Windows")).getByText("Current session")).toBeInTheDocument();
  expect(within(row("Safari on iOS")).queryByText("Current session")).toBeNull();
  expect(within(row("Safari on iOS")).getByText(/203\.0\.113\.7/)).toBeInTheDocument();
});

test("the current session has no sign-out button of its own", async () => {
  show();
  await screen.findByText("Chrome on Windows");
  expect(within(row("Chrome on Windows")).queryByRole("button")).toBeNull();
  expect(within(row("Firefox on Linux")).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

test("signing out one session removes just that one", async () => {
  show();
  await screen.findByText("Safari on iOS");
  await fireEvent.click(within(row("Safari on iOS")).getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(screen.queryByText("Safari on iOS")).toBeNull());
  expect(auth.revokeSession).toHaveBeenCalledWith({ token: "phone" });
  expect(labels()).toEqual(["Chrome on Windows", "Firefox on Linux"]);
});

test("a refused sign-out keeps the session and says why", async () => {
  auth.revokeSession.mockResolvedValue({ data: null, error: { message: "Session not found" } });
  show();
  await screen.findByText("Safari on iOS");
  await fireEvent.click(within(row("Safari on iOS")).getByRole("button", { name: "Sign out" }));
  await screen.findByText("Session not found");
  expect(screen.getByText("Safari on iOS")).toBeInTheDocument();
});

test("signing out all others asks first and keeps this session", async () => {
  show();
  await screen.findByText("Chrome on Windows");
  await fireEvent.click(screen.getByRole("button", { name: /Sign out all other sessions/ }));
  await waitFor(() => expect(get(confirmRequest)?.description).toContain("(2)"));
  get(confirmRequest)!.resolve({ ok: false, notify: false });
  confirmRequest.set(null);
  expect(auth.revokeOtherSessions).not.toHaveBeenCalled();

  await fireEvent.click(screen.getByRole("button", { name: /Sign out all other sessions/ }));
  await waitFor(() => expect(get(confirmRequest)).not.toBeNull());
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => expect(labels()).toEqual(["Chrome on Windows"]));
  expect(auth.revokeOtherSessions).toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Sign out all other sessions/ })).toBeDisabled();
});

test("with no other sessions there is nothing to sign out", async () => {
  auth.listSessions.mockResolvedValue({ data: [sessions[2]], error: null });
  show();
  await screen.findByText("Chrome on Windows");
  expect(screen.getByRole("button", { name: /Sign out all other sessions/ })).toBeDisabled();
});

const STALE = { data: null, error: { code: "SESSION_NOT_FRESH", message: "x" } };

test("an older session confirms the password in a dialog before the list is shown", async () => {
  auth.listSessions.mockResolvedValueOnce(STALE);
  auth.getSession.mockResolvedValueOnce({ data: { session: { token: "stale" } }, error: null });
  auth.signIn.mockResolvedValue({ data: {}, error: null });
  show();
  await fireEvent.click(await screen.findByRole("button", { name: "Confirm it's you" }));
  expect(screen.queryByRole("listitem")).toBeNull();
  const dialog = await screen.findByRole("dialog");
  expect(document.querySelector('input[autocomplete="username"]')).toHaveValue("ada");

  await fireEvent.input(within(dialog).getByLabelText("Password"), { target: { value: "correct horse battery" } });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
  await screen.findByText("Chrome on Windows");
  expect(auth.signIn).toHaveBeenCalledWith({ username: "ada", password: "correct horse battery" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("button", { name: "Confirm it's you" })).toBeNull();
});

test("a wrong password keeps the dialog open and the list hidden", async () => {
  auth.listSessions.mockResolvedValue(STALE);
  auth.signIn.mockResolvedValue({ data: null, error: { code: "INVALID_USERNAME_OR_PASSWORD", message: "x" } });
  show();
  await fireEvent.click(await screen.findByRole("button", { name: "Confirm it's you" }));
  const dialog = await screen.findByRole("dialog");
  await fireEvent.input(within(dialog).getByLabelText("Password"), { target: { value: "nope" } });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
  await within(dialog).findByText("Incorrect password.");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.queryByRole("listitem")).toBeNull();
});

test("cancelling the dialog keeps the list locked", async () => {
  auth.listSessions.mockResolvedValue(STALE);
  show();
  await fireEvent.click(await screen.findByRole("button", { name: "Confirm it's you" }));
  await fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(auth.signIn).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm it's you" })).toBeInTheDocument();
});

test("a password confirmed elsewhere on the page unlocks the list", async () => {
  auth.listSessions.mockResolvedValueOnce(STALE);
  show();
  await screen.findByRole("button", { name: "Confirm it's you" });
  freshSignIn.confirmations += 1;
  await screen.findByText("Chrome on Windows");
  expect(screen.queryByRole("button", { name: "Confirm it's you" })).toBeNull();
});

test("a password confirmed elsewhere reloads an open list, since this device's session changed", async () => {
  show();
  await screen.findByText("Chrome on Windows");
  auth.getSession.mockResolvedValue({ data: { session: { token: "phone" } }, error: null });
  freshSignIn.confirmations += 1;
  await waitFor(() => expect(within(row("Safari on iOS")).getByText("Current session")).toBeInTheDocument());
  expect(auth.listSessions).toHaveBeenCalledTimes(2);
});

test("confirmations from before the section opened don't reload it", async () => {
  freshSignIn.confirmations += 1;
  show();
  await screen.findByText("Chrome on Windows");
  await new Promise((r) => setTimeout(r, 20));
  expect(auth.listSessions).toHaveBeenCalledTimes(1);
});

test("a session without a known agent or address still reads sensibly", async () => {
  auth.listSessions.mockResolvedValue({
    data: [sessions[2], { ...session("odd", "", "2026-09-01T10:00:00Z"), userAgent: null, ipAddress: null }],
    error: null,
  });
  show();
  await screen.findByText("Unknown device");
  expect(within(row("Unknown device")).getByText(/^Signed in/)).toBeInTheDocument();
});
