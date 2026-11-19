// SPDX-License-Identifier: AGPL-3.0-or-later
import { invalidateAll } from "$app/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import TwoFactorManager from "#lib/components/TwoFactorManager.svelte";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  disable: vi.fn<(a: unknown) => Promise<Res>>(),
  generateBackupCodes: vi.fn<(a: unknown) => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: { twoFactor: { disable: auth.disable, generateBackupCodes: auth.generateBackupCodes } },
}));

const setup = (props: { enabled: boolean; staff: boolean; required: boolean }) =>
  render(TwoFactorManager, { props: { username: "ada", ...props } });

beforeEach(() => {
  auth.disable.mockResolvedValue({ data: { status: true }, error: null });
  auth.generateBackupCodes.mockResolvedValue({ data: { backupCodes: ["new-1", "new-2"] }, error: null });
});

test("off, it offers setup", () => {
  setup({ enabled: false, staff: false, required: false });
  expect(screen.getByText("Off")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
});

test("a reader can turn it off with their password", async () => {
  setup({ enabled: true, staff: false, required: false });
  await fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
  await fireEvent.input(await screen.findByLabelText("Password"), { target: { value: "secret" } });
  await fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
  await waitFor(() => expect(auth.disable).toHaveBeenCalledWith({ password: "secret" }));
  expect(invalidateAll).toHaveBeenCalled();
});

test("a reader can replace their backup codes", async () => {
  setup({ enabled: true, staff: false, required: false });
  await fireEvent.click(screen.getByRole("button", { name: "New backup codes" }));
  await fireEvent.input(await screen.findByLabelText("Password"), { target: { value: "secret" } });
  await fireEvent.click(screen.getByRole("button", { name: "Make new codes" }));
  expect(await screen.findByRole("list", { name: "Backup codes" })).toHaveTextContent("new-1");
});

test("a wrong password says so and turns nothing off", async () => {
  auth.disable.mockResolvedValue({ error: { code: "INVALID_PASSWORD" } });
  setup({ enabled: true, staff: false, required: false });
  await fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
  await fireEvent.input(await screen.findByLabelText("Password"), { target: { value: "nope" } });
  await fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
  await screen.findByText("That password isn't right.");
  expect(invalidateAll).not.toHaveBeenCalled();
});

test("staff who must keep it on can't turn it off, and have no backup codes", () => {
  setup({ enabled: true, staff: true, required: true });
  expect(screen.queryByRole("button", { name: "Turn off" })).toBe(null);
  expect(screen.queryByRole("button", { name: "New backup codes" })).toBe(null);
  expect(screen.getByText(/ask an admin to reset it/)).toBeInTheDocument();
});

test("staff it isn't set up for yet are told why to set it up", () => {
  setup({ enabled: false, staff: true, required: true });
  expect(screen.getByText("Required to use moderation tools on this instance.")).toBeInTheDocument();
});
