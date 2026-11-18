// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import TwoFactorSetup from "#lib/components/TwoFactorSetup.svelte";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  enable: vi.fn<(a: unknown) => Promise<Res>>(),
  verifyTotp: vi.fn<(a: unknown) => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: { twoFactor: { enable: auth.enable, verifyTotp: auth.verifyTotp } },
}));

const URI = "otpauth://totp/Omicron:ada?secret=JBSWY3DPEHPK3PXP&issuer=Omicron";
const CODES = ["aaaaa-11111", "bbbbb-22222"];

beforeEach(() => {
  auth.enable.mockResolvedValue({ data: { method: "totp", totpURI: URI, backupCodes: CODES }, error: null });
  auth.verifyTotp.mockResolvedValue({ data: {}, error: null });
});

async function throughScan(staff: boolean) {
  const ondone = vi.fn<() => void>();
  render(TwoFactorSetup, { props: { username: "ada", staff, ondone } });
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "secret" } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("img", { name: "QR code for your authenticator app" });
  expect(screen.getByTestId("totp-key")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");
  await fireEvent.input(screen.getByLabelText("6-digit code from the app"), { target: { value: "123456" } });
  await fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
  return ondone;
}

test("password, then the QR code and key, then a code turns it on and shows the backup codes once", async () => {
  const ondone = await throughScan(false);
  expect(auth.enable).toHaveBeenCalledWith({ password: "secret" });
  expect(auth.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
  const list = await screen.findByRole("list", { name: "Backup codes" });
  expect(list).toHaveTextContent("aaaaa-11111");
  expect(ondone).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "I've saved them" }));
  expect(ondone).toHaveBeenCalledOnce();
});

test("staff finish as soon as the code is confirmed, with no backup codes", async () => {
  auth.enable.mockResolvedValue({ data: { method: "totp", totpURI: URI, backupCodes: [] }, error: null });
  const ondone = await throughScan(true);
  await waitFor(() => expect(ondone).toHaveBeenCalledOnce());
  expect(screen.queryByRole("list", { name: "Backup codes" })).toBe(null);
});

test("a wrong password stays on the first step and says so", async () => {
  auth.enable.mockResolvedValue({ error: { code: "INVALID_PASSWORD", message: "Invalid password" } });
  render(TwoFactorSetup, { props: { username: "ada", staff: false, ondone: vi.fn<() => void>() } });
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "nope" } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("That password isn't right.");
  expect(screen.queryByRole("img", { name: /QR code/ })).toBe(null);
});

test("a wrong code keeps the QR code up to try again", async () => {
  auth.verifyTotp.mockResolvedValue({ error: { code: "INVALID_CODE" } });
  const ondone = await throughScan(false);
  await screen.findByText(/code didn't work/);
  expect(screen.getByRole("img", { name: /QR code/ })).toBeInTheDocument();
  expect(ondone).not.toHaveBeenCalled();
});

test("Turn on waits for six digits", async () => {
  render(TwoFactorSetup, { props: { username: "ada", staff: false, ondone: vi.fn<() => void>() } });
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "secret" } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await fireEvent.input(await screen.findByLabelText("6-digit code from the app"), { target: { value: "12a3" } });
  expect(screen.getByLabelText("6-digit code from the app")).toHaveValue("123");
  expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
});

// 1Password, Bitwarden and others save the secret from the QR code or the otpauth link, then fill the code.
test("password managers can save the secret and fill the code", async () => {
  render(TwoFactorSetup, { props: { username: "ada", staff: false, ondone: vi.fn<() => void>() } });
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "secret" } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("link", { name: "Open in authenticator app" })).toHaveAttribute("href", URI);
  const code = screen.getByLabelText("6-digit code from the app");
  expect(code).toHaveAttribute("autocomplete", "one-time-code");
  for (const ignore of ["data-1p-ignore", "data-lpignore", "data-bwignore"]) expect(code).not.toHaveAttribute(ignore);
  expect(document.querySelector('input[autocomplete="username"]')).toHaveValue("ada");
});
