// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import ConfirmPasswordDialog from "#lib/components/ConfirmPasswordDialog.svelte";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Res>>(),
  signIn: vi.fn<(a: unknown) => Promise<Res>>(),
  revoke: vi.fn<(a: unknown) => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: { getSession: auth.getSession, signIn: { username: auth.signIn }, revokeSession: auth.revoke },
}));

const description = "Enter your password to continue.";
const show = (onconfirmed = vi.fn()) => {
  render(ConfirmPasswordDialog, { props: { open: true, username: "ada", description, onconfirmed } });
  return onconfirmed;
};
const typePassword = (value: string) => fireEvent.input(screen.getByLabelText("Password"), { target: { value } });

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: { token: "old" } }, error: null });
  auth.revoke.mockResolvedValue({ data: {}, error: null });
});

test("names the account for password managers and explains why it asks", async () => {
  show();
  expect(await screen.findByRole("dialog")).toHaveTextContent(description);
  expect(document.querySelector('input[autocomplete="username"]')).toHaveValue("ada");
  expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
});

test("Continue waits for a password", async () => {
  show();
  expect(await screen.findByRole("button", { name: "Continue" })).toBeDisabled();
  await typePassword("secret");
  expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("the right password closes the dialog and hands control back", async () => {
  auth.signIn.mockResolvedValue({ data: {}, error: null });
  const onconfirmed = show();
  await typePassword("secret");
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(onconfirmed).toHaveBeenCalledOnce());
  expect(auth.signIn).toHaveBeenCalledWith({ username: "ada", password: "secret" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("a wrong password stays open with the reason and doesn't hand back", async () => {
  auth.signIn.mockResolvedValue({ data: null, error: { code: "INVALID_USERNAME_OR_PASSWORD", message: "x" } });
  const onconfirmed = show();
  await typePassword("nope");
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Incorrect password.");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(onconfirmed).not.toHaveBeenCalled();
});

test("cancelling closes without checking the password", async () => {
  const onconfirmed = show();
  await typePassword("secret");
  await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(auth.signIn).not.toHaveBeenCalled();
  expect(onconfirmed).not.toHaveBeenCalled();
});
