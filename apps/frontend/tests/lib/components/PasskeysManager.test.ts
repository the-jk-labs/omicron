// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Passkey } from "@better-auth/passkey/client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
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
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    passkey: {
      listUserPasskeys: auth.list,
      addPasskey: auth.add,
      updatePasskey: auth.update,
      deletePasskey: auth.remove,
    },
    getSession: auth.getSession,
    signIn: { username: auth.signIn },
    revokeSession: auth.revoke,
  },
}));

// Dates arrive over JSON as strings, though Better Auth types them as Date.
const passkey = (p: Pick<Passkey, "id" | "name" | "backedUp"> & { createdAt: string }): Passkey => ({
  publicKey: "pk",
  userId: "u1",
  credentialID: `cred-${p.id}`,
  counter: 0,
  deviceType: p.backedUp ? "multiDevice" : "singleDevice",
  ...p,
  createdAt: p.createdAt as unknown as Date,
});
const laptop = passkey({ id: "p1", name: "Laptop", backedUp: true, createdAt: "2026-09-01T00:00:00Z" });
const unnamed = passkey({ id: "p2", name: undefined, backedUp: false, createdAt: "2026-09-02T00:00:00Z" });

beforeEach(() => {
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

test("a server-loaded list shows straight away, without loading it again", () => {
  render(PasskeysManager, { props: { username: "ada", initial: [laptop] } });
  expect(screen.getByText("Laptop")).toBeInTheDocument();
  expect(screen.queryByText("Loading…")).toBeNull();
  expect(auth.list).not.toHaveBeenCalled();
});

test("a server-loaded empty list shows the empty state straight away", () => {
  render(PasskeysManager, { props: { username: "ada", initial: [] } });
  expect(screen.getByText("No passkeys yet.")).toBeInTheDocument();
  expect(auth.list).not.toHaveBeenCalled();
});

test("adding to a server-loaded list reloads it", async () => {
  auth.add.mockResolvedValue({ data: { id: "p3" }, error: null });
  auth.list.mockResolvedValue({ data: [laptop, { ...laptop, id: "p3", name: "Phone" }], error: null });
  render(PasskeysManager, { props: { username: "ada", initial: [laptop] } });
  await fireEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Phone");
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

test("an old session confirms the password in a dialog, then the passkey is added", async () => {
  auth.add.mockResolvedValueOnce({ data: null, error: { code: "SESSION_NOT_FRESH" } });
  auth.add.mockResolvedValueOnce({ data: { id: "p3" }, error: null });
  auth.getSession.mockResolvedValue({ data: { session: { token: "old-token" } }, error: null });
  auth.signIn.mockResolvedValue({ data: {}, error: null });
  auth.revoke.mockResolvedValue({ data: {}, error: null });
  render(PasskeysManager, { props: { username: "ada" } });
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  const dialog = await screen.findByRole("dialog");
  await fireEvent.input(within(dialog).getByLabelText("Password"), { target: { value: "hunter2hunter2" } });
  expect(document.querySelector('input[autocomplete="username"]')).toHaveValue("ada");
  auth.list.mockResolvedValue({ data: [laptop, unnamed, { ...laptop, id: "p3", name: "Phone" }], error: null });
  await fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
  await screen.findByText("Phone");
  expect(auth.signIn).toHaveBeenCalledWith({ username: "ada", password: "hunter2hunter2" });
  expect(auth.revoke).toHaveBeenCalledWith({ token: "old-token" });
  expect(auth.add).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("cancelling the password dialog adds nothing", async () => {
  auth.add.mockResolvedValue({ data: null, error: { code: "SESSION_NOT_FRESH" } });
  render(PasskeysManager, { props: { username: "ada" } });
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(auth.signIn).not.toHaveBeenCalled();
  expect(auth.add).toHaveBeenCalledTimes(1);
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

test("a failed load says so instead of claiming there are no passkeys", async () => {
  auth.list.mockResolvedValue({ data: null, error: { message: "Passkeys down" } });
  render(PasskeysManager, { props: { username: "ada" } });
  await screen.findByText("Passkeys down");
  expect(screen.queryByText("No passkeys yet.")).toBeNull();
});

test("a failed add leaves the list as it was", async () => {
  auth.add.mockResolvedValue({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } });
  render(PasskeysManager, { props: { username: "ada" } });
  await fireEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
  await screen.findByText("Passkey setup was cancelled or timed out.");
  expect(auth.list).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Laptop")).toBeInTheDocument();
});
