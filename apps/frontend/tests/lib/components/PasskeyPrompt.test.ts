// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PasskeyPrompt from "#lib/components/PasskeyPrompt.svelte";
import { dismissPasskeyPrompt, passkeyPromptDismissed, resetPasskeyPrompt } from "#lib/passkeyPrompt.js";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  list: vi.fn<() => Promise<Res>>(),
  add: vi.fn<() => Promise<Res>>(),
  getSession: vi.fn<() => Promise<Res>>(),
  signIn: vi.fn<(a: unknown) => Promise<Res>>(),
  revoke: vi.fn<(a: unknown) => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    passkey: { listUserPasskeys: auth.list, addPasskey: auth.add },
    getSession: auth.getSession,
    signIn: { username: auth.signIn },
    revokeSession: auth.revoke,
  },
}));

const TITLE = "Sign in faster with a passkey";
const ada = { id: "u1", username: "ada" };
// The offer waits a moment after the home page appears.
const OFFER_DELAY_MS = 1500;
const pastDelay = () => vi.advanceTimersByTimeAsync(OFFER_DELAY_MS);
async function show(user: typeof ada | null = ada, onHome = true) {
  const view = render(PasskeyPrompt, { props: { user, onHome } });
  await pastDelay();
  return view;
}
const settle = pastDelay;

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  auth.list.mockResolvedValue({ data: [], error: null });
});

test("offers a passkey to a signed-in reader who has none", async () => {
  await show();
  await screen.findByText(TITLE);
  expect(screen.getByText("Use your fingerprint, face, or screen lock instead of your password.")).toBeInTheDocument();
});

test.each([
  ["already has a passkey", () => auth.list.mockResolvedValue({ data: [{ id: "p1" }], error: null })],
  ["declined it before", () => dismissPasskeyPrompt()],
  ["has a browser without passkeys", () => vi.stubGlobal("PublicKeyCredential", undefined)],
])("stays quiet for a reader who %s", async (_, arrange) => {
  arrange();
  await show();
  await settle();
  expect(screen.queryByText(TITLE)).toBeNull();
});

test("a signed-out visitor is never checked", async () => {
  await show(null);
  await settle();
  expect(auth.list).not.toHaveBeenCalled();
});

test("Not now closes it and remembers the choice", async () => {
  await show();
  await fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(passkeyPromptDismissed()).toBe(true);
});

test("adding one confirms it, and closing then remembers the choice", async () => {
  auth.add.mockResolvedValue({ data: { id: "p1" }, error: null });
  await show();
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Passkey added");
  await fireEvent.click(screen.getByRole("button", { name: "Done" }));
  await waitFor(() => expect(passkeyPromptDismissed()).toBe(true));
});

test("a failed add stays open with the reason", async () => {
  auth.add.mockResolvedValue({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } });
  await show();
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Passkey setup was cancelled or timed out.");
  expect(screen.getByText(TITLE)).toBeInTheDocument();
  expect(passkeyPromptDismissed()).toBe(false);
});

test("an old session confirms the password, swaps the session, then adds the passkey", async () => {
  auth.add.mockResolvedValueOnce({ data: null, error: { code: "SESSION_NOT_FRESH" } });
  auth.add.mockResolvedValueOnce({ data: { id: "p1" }, error: null });
  auth.getSession.mockResolvedValue({ data: { session: { token: "old-token" } }, error: null });
  auth.signIn.mockResolvedValue({ data: {}, error: null });
  auth.revoke.mockResolvedValue({ data: {}, error: null });
  await show();
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Confirm it's you");
  expect(document.querySelector('input[autocomplete="username"]')).toHaveValue("ada");
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Passkey added");
  expect(auth.signIn).toHaveBeenCalledWith({ username: "ada", password: "hunter2hunter2" });
  expect(auth.revoke).toHaveBeenCalledWith({ token: "old-token" });
  expect(auth.add).toHaveBeenCalledTimes(2);
});

test("a wrong password stays on the confirm step and adds nothing", async () => {
  auth.add.mockResolvedValue({ data: null, error: { code: "SESSION_NOT_FRESH" } });
  auth.getSession.mockResolvedValue({ data: { session: { token: "old-token" } }, error: null });
  auth.signIn.mockResolvedValue({ data: null, error: { code: "INVALID_USERNAME_OR_PASSWORD", message: "Invalid" } });
  await show();
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await fireEvent.input(await screen.findByLabelText("Password"), { target: { value: "wrong" } });
  await fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
  await screen.findByText("Incorrect password.");
  expect(screen.getByText("Confirm it's you")).toBeInTheDocument();
  expect(auth.add).toHaveBeenCalledOnce();
  expect(auth.revoke).not.toHaveBeenCalled();
  expect(passkeyPromptDismissed()).toBe(false);
});

// The app signs in and out without a page load (refreshAll + goto), so the same
// component instance sees the account leave and come back.
test("signing out and back in as the same account offers it again, without a reload", async () => {
  const { rerender } = await show();
  await fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());

  // What the auth client does on sign-out and sign-in.
  resetPasskeyPrompt();
  await rerender({ user: null, onHome: true });
  await rerender({ user: ada, onHome: true });
  await pastDelay();

  await screen.findByText(TITLE);
  expect(auth.list).toHaveBeenCalledTimes(2);
});

// Signing up lands on /verify-email already signed in; the offer must not
// interrupt that or any other page.
test("off the home page it stays quiet and doesn't even check", async () => {
  await show(ada, false);
  await settle();
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(auth.list).not.toHaveBeenCalled();
});

test("a sign-in elsewhere is offered once the reader reaches home", async () => {
  const { rerender } = await show(ada, false);
  await settle();
  await rerender({ user: ada, onHome: true });
  await pastDelay();
  await screen.findByText(TITLE);
  expect(auth.list).toHaveBeenCalledOnce();
});

test("leaving home and coming back doesn't offer it twice in one sign-in", async () => {
  auth.list.mockResolvedValue({ data: [{ id: "p1" }], error: null });
  const { rerender } = await show();
  await settle();
  await rerender({ user: ada, onHome: false });
  await rerender({ user: ada, onHome: true });
  await settle();
  expect(auth.list).toHaveBeenCalledOnce();
});

test("waits a moment after the home page appears before opening", async () => {
  render(PasskeyPrompt, { props: { user: ada, onHome: true } });
  await vi.advanceTimersByTimeAsync(OFFER_DELAY_MS - 200);
  expect(screen.queryByText(TITLE)).toBeNull();
  await vi.advanceTimersByTimeAsync(200);
  await screen.findByText(TITLE);
});

test.each([
  ["leaves home", { user: ada, onHome: false }],
  ["signs out", { user: null, onHome: true }],
])("a reader who %s during the wait isn't interrupted", async (_, props) => {
  const { rerender } = render(PasskeyPrompt, { props: { user: ada, onHome: true } });
  await vi.advanceTimersByTimeAsync(500);
  await rerender(props);
  await pastDelay();
  expect(screen.queryByText(TITLE)).toBeNull();
});
