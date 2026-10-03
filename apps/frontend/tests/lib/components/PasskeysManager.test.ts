// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
import PasskeyPrompt from "#lib/components/PasskeyPrompt.svelte";
import PasskeysManager from "#lib/components/PasskeysManager.svelte";
import { confirmRequest } from "#lib/components/ui/confirm.js";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  list: vi.fn<() => Promise<Res>>(),
  add: vi.fn<() => Promise<Res>>(),
  update: vi.fn<(a: unknown) => Promise<Res>>(),
  remove: vi.fn<(a: unknown) => Promise<Res>>(),
  getSession: vi.fn<() => Promise<Res>>(),
  signIn: vi.fn<(a: unknown) => Promise<Res>>(),
  revoke: vi.fn<(a: unknown) => Promise<Res>>(),
}));
// Better Auth's shared passkey list (`useListPasskeys`): it loads when first
// subscribed and reloads after any successful add, rename or delete, wherever
// in the app that happened.
type ListState = { data: unknown; error: unknown; isPending: boolean };
const shared = vi.hoisted(() => {
  const subscribers = new Set<(v: ListState) => void>();
  const state = { value: { data: null, error: null, isPending: true } as ListState };
  const refetch = async () => {
    const res = await auth.list();
    state.value = { data: res.data ?? null, error: res.error ?? null, isPending: false };
    for (const fn of subscribers) fn(state.value);
  };
  const changes =
    <A extends unknown[]>(fn: (...args: A) => Promise<Res>) =>
    async (...args: A) => {
      const res = await fn(...args);
      if (!res?.error) await refetch();
      return res;
    };
  return {
    changes,
    reset: () => (state.value = { data: null, error: null, isPending: true }),
    store: {
      subscribe(fn: (v: ListState) => void) {
        subscribers.add(fn);
        fn(state.value);
        if (subscribers.size === 1) void refetch();
        return () => void subscribers.delete(fn);
      },
    },
  };
});
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    useListPasskeys: () => shared.store,
    passkey: {
      listUserPasskeys: auth.list,
      addPasskey: shared.changes(auth.add),
      updatePasskey: shared.changes(auth.update),
      deletePasskey: shared.changes(auth.remove),
    },
    getSession: auth.getSession,
    signIn: { username: auth.signIn },
    revokeSession: auth.revoke,
  },
}));

const laptop = { id: "p1", name: "Laptop", backedUp: true, createdAt: "2026-09-01T00:00:00Z" };
const unnamed = { id: "p2", name: null, backedUp: false, createdAt: "2026-09-02T00:00:00Z" };

beforeEach(() => {
  shared.reset();
  localStorage.clear();
  confirmRequest.set(null);
  vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  auth.list.mockResolvedValue({ data: [laptop, unnamed], error: null });
});

test("lists passkeys; an unnamed one reads as just Passkey", async () => {
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("Laptop");
  expect(screen.getByText("Passkey")).toBeInTheDocument();
  expect(screen.getByText(/Synced · Added/)).toBeInTheDocument();
  expect(screen.getByText(/This device only · Added/)).toBeInTheDocument();
});

test("shows an empty state", async () => {
  auth.list.mockResolvedValue({ data: [], error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("No passkeys yet.");
});

test("adding a passkey reloads the list", async () => {
  auth.add.mockResolvedValue({ data: { id: "p3" }, error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("Laptop");
  auth.list.mockResolvedValue({ data: [laptop, unnamed, { ...laptop, id: "p3", name: "Phone" }], error: null });
  await fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Phone");
});

test("a failed add explains itself", async () => {
  auth.add.mockResolvedValue({ data: null, error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" } });
  render(PasskeysManager, { props: { username: "ada" } });
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await screen.findByText("This device already has a passkey for your account.");
});

test("an old session confirms the password, then the passkey is added", async () => {
  auth.add.mockResolvedValueOnce({ data: null, error: { code: "SESSION_NOT_FRESH" } });
  auth.add.mockResolvedValueOnce({ data: { id: "p3" }, error: null });
  auth.getSession.mockResolvedValue({ data: { session: { token: "old-token" } }, error: null });
  auth.signIn.mockResolvedValue({ data: {}, error: null });
  auth.revoke.mockResolvedValue({ data: {}, error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await fireEvent.input(await screen.findByLabelText("Password"), { target: { value: "hunter2hunter2" } });
  expect(document.querySelector('input[autocomplete="username"]')).toHaveValue("ada");
  auth.list.mockResolvedValue({ data: [laptop, unnamed, { ...laptop, id: "p3", name: "Phone" }], error: null });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Phone");
  expect(auth.signIn).toHaveBeenCalledWith({ username: "ada", password: "hunter2hunter2" });
  expect(auth.revoke).toHaveBeenCalledWith({ token: "old-token" });
  expect(screen.queryByText("Confirm it's you")).toBeNull();
});

test("cancelling the password step adds nothing", async () => {
  auth.add.mockResolvedValue({ data: null, error: { code: "SESSION_NOT_FRESH" } });
  render(PasskeysManager, { props: { username: "ada" } });
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Confirm it's you");
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByText("Confirm it's you")).toBeNull();
  expect(auth.signIn).not.toHaveBeenCalled();
});

test("renames a passkey", async () => {
  auth.update.mockResolvedValue({ data: { status: true }, error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("Laptop");
  await fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
  await fireEvent.input(screen.getByLabelText("Passkey name"), { target: { value: "  Work laptop " } });
  await fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Work laptop");
  expect(auth.update).toHaveBeenCalledWith({ id: "p1", name: "Work laptop" });
});

test("a refused rename keeps the old name and shows why", async () => {
  auth.update.mockResolvedValue({ data: null, error: { message: "Passkey names are at most 60 characters." } });
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("Laptop");
  await fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
  await fireEvent.input(screen.getByLabelText("Passkey name"), { target: { value: "Other" } });
  await fireEvent.keyDown(screen.getByLabelText("Passkey name"), { key: "Enter" });
  await screen.findByText("Passkey names are at most 60 characters.");
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Laptop")).toBeInTheDocument();
});

test("removing asks first, and only removes on yes", async () => {
  auth.remove.mockResolvedValue({ data: { status: true }, error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("Laptop");
  await fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
  await waitFor(() => expect(get(confirmRequest)?.description).toContain("“Laptop”"));
  get(confirmRequest)!.resolve({ ok: false, notify: false });
  confirmRequest.set(null);
  expect(auth.remove).not.toHaveBeenCalled();

  await fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
  await waitFor(() => expect(get(confirmRequest)).not.toBeNull());
  get(confirmRequest)!.resolve({ ok: true, notify: false });
  await waitFor(() => expect(screen.queryByText("Laptop")).toBeNull());
  expect(auth.remove).toHaveBeenCalledWith({ id: "p1" });
});

test("a browser without passkeys can't add one", async () => {
  vi.stubGlobal("PublicKeyCredential", undefined);
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("This browser doesn't support passkeys.");
  expect(screen.getByRole("button", { name: "Add a passkey" })).toBeDisabled();
});

// Both read Better Auth's one shared list, so an add in either reaches the other.
test("a passkey added from the prompt shows up in the list without a reload", async () => {
  auth.list.mockResolvedValue({ data: [], error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    render(PasskeyPrompt, { props: { user: { id: "u1", username: "ada" }, onHome: true } });
    // The prompt waits a moment before it opens.
    await vi.advanceTimersByTimeAsync(1500);
  } finally {
    vi.useRealTimers();
  }
  await screen.findByText("No passkeys yet.");
  const prompt = await screen.findByRole("dialog");

  auth.list.mockResolvedValue({ data: [{ ...laptop, id: "p9", name: "Phone" }], error: null });
  auth.add.mockResolvedValue({ data: { id: "p9" }, error: null });
  await fireEvent.click(within(prompt).getByRole("button", { name: "Add a passkey" }));

  await screen.findByText("Phone");
  expect(screen.queryByText("No passkeys yet.")).toBeNull();
});
