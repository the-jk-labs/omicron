// SPDX-License-Identifier: AGPL-3.0-or-later
import { refreshAll } from "$app/navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import ChangeEmailDialog from "#lib/components/ChangeEmailDialog.svelte";

type Res = { data?: unknown; error?: { code?: string; message?: string } | null };
const auth = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<Res>>(),
  signIn: vi.fn<(a: unknown) => Promise<Res>>(),
  revokeSession: vi.fn<(a: unknown) => Promise<Res>>(),
  requestEmailChange: vi.fn<(a: unknown) => Promise<Res>>(),
  changeEmail: vi.fn<(a: unknown) => Promise<Res>>(),
  revokeOtherSessions: vi.fn<() => Promise<Res>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    getSession: auth.getSession,
    signIn: { username: auth.signIn },
    revokeSession: auth.revokeSession,
    revokeOtherSessions: auth.revokeOtherSessions,
    emailOtp: { requestEmailChange: auth.requestEmailChange, changeEmail: auth.changeEmail },
  },
}));

const ok: Res = { data: {}, error: null };

function show() {
  render(ChangeEmailDialog, {
    props: { open: true, username: "ada", email: "ada@old.test" },
  });
}

async function confirmPassword(password = "correct horse battery") {
  await fireEvent.input(await screen.findByLabelText("Password"), { target: { value: password } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

async function enterEmail(email = "Ada@New.test") {
  await fireEvent.input(await screen.findByLabelText("New email"), { target: { value: email } });
  await fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

async function enterCode(code = "482913") {
  await fireEvent.input(await screen.findByLabelText("Code"), { target: { value: code } });
  await fireEvent.click(screen.getByRole("button", { name: "Verify" }));
}

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: { token: "old" } }, error: null });
  auth.signIn.mockResolvedValue(ok);
  auth.revokeSession.mockResolvedValue(ok);
  auth.requestEmailChange.mockResolvedValue(ok);
  auth.changeEmail.mockResolvedValue(ok);
  auth.revokeOtherSessions.mockResolvedValue(ok);
});

test("password, then new email, then the code changes it and signs out other devices", async () => {
  show();
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  expect(screen.queryByLabelText("New email")).toBeNull();

  await confirmPassword();
  await screen.findByText("Step 2 of 3");
  expect(auth.signIn).toHaveBeenCalledWith({ username: "ada", password: "correct horse battery" });
  expect(auth.requestEmailChange).not.toHaveBeenCalled();

  await enterEmail();
  await screen.findByText("Step 3 of 3");
  expect(auth.requestEmailChange).toHaveBeenCalledWith({ newEmail: "ada@new.test" });
  expect(screen.getByText("ada@new.test")).toBeInTheDocument();

  await enterCode();
  await screen.findByText(/Your login email is now/);
  expect(auth.changeEmail).toHaveBeenCalledWith({ newEmail: "ada@new.test", otp: "482913" });
  expect(auth.revokeOtherSessions).toHaveBeenCalled();
  expect(refreshAll).toHaveBeenCalled();
});

test("a wrong password never reaches the email step", async () => {
  auth.signIn.mockResolvedValue({ data: null, error: { code: "INVALID_USERNAME_OR_PASSWORD", message: "x" } });
  show();
  await confirmPassword("nope");
  await screen.findByText("Incorrect password.");
  expect(screen.queryByLabelText("New email")).toBeNull();
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
});

test("the current address is refused before any code is sent", async () => {
  show();
  await confirmPassword();
  await enterEmail(" ADA@old.test ");
  await screen.findByText("That's already your email.");
  expect(auth.requestEmailChange).not.toHaveBeenCalled();
});

test("an address already in use is explained on the email step", async () => {
  auth.requestEmailChange.mockResolvedValue({ data: null, error: { message: "This email is already in use." } });
  show();
  await confirmPassword();
  await enterEmail();
  await screen.findByText("This email is already in use.");
  expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
});

test("a wrong code stays on the code step and changes nothing", async () => {
  auth.changeEmail.mockResolvedValue({ data: null, error: { code: "INVALID_OTP", message: "Invalid OTP" } });
  show();
  await confirmPassword();
  await enterEmail();
  await enterCode("000000");
  await screen.findByText("That code isn't right. Check it and try again.");
  expect(auth.revokeOtherSessions).not.toHaveBeenCalled();
  expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
});

test("the code field keeps digits only, and Verify waits for all six", async () => {
  show();
  await confirmPassword();
  await enterEmail();
  const input = await screen.findByLabelText("Code");
  await fireEvent.input(input, { target: { value: "48 29-1" } });
  expect(input).toHaveValue("48291");
  expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
});

test("a session too old for the server goes back to the password step", async () => {
  auth.changeEmail.mockResolvedValue({ data: null, error: { code: "PASSWORD_REQUIRED", message: "x" } });
  show();
  await confirmPassword();
  await enterEmail();
  await enterCode();
  await screen.findByText("It's been a while. Confirm your password again to continue.");
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  expect(screen.getByLabelText("Password")).toHaveValue("");
});

test("Back returns to the email step to fix a typo", async () => {
  show();
  await confirmPassword();
  await enterEmail();
  await fireEvent.click(await screen.findByRole("button", { name: "Back" }));
  expect(await screen.findByLabelText("New email")).toHaveValue("Ada@New.test");
});

test("resending waits out a short cooldown", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    show();
    await confirmPassword();
    await enterEmail();
    await screen.findByText(/Send again in 30s/);
    await vi.advanceTimersByTimeAsync(30_000);
    await fireEvent.click(await screen.findByRole("button", { name: "Send again" }));
    await waitFor(() => expect(auth.requestEmailChange).toHaveBeenCalledTimes(2));
  } finally {
    vi.useRealTimers();
  }
});

// The username is the login everywhere, so the saved login doesn't change with the email.
test("the form names the username as the login through every step", async () => {
  show();
  const login = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
  expect(login).toHaveValue("ada");
  await confirmPassword();
  await enterEmail();
  await screen.findByText("Step 3 of 3");
  expect(login).toHaveValue("ada");
  expect(document.querySelectorAll('input[autocomplete="username"]')).toHaveLength(1);
});

test("the new email field isn't offered to password managers", async () => {
  show();
  await confirmPassword();
  expect(await screen.findByLabelText("New email")).toHaveAttribute("data-1p-ignore");
});

// 1Password skipped the hidden login field and offered to save the code as the
// new username; the code field has to opt out like the other non-login inputs.
test("the code field isn't taken for a username by password managers", async () => {
  show();
  await confirmPassword();
  await enterEmail();
  const input = await screen.findByLabelText("Code");
  expect(input).toHaveAttribute("data-1p-ignore");
  expect(input).toHaveAttribute("data-lpignore", "true");
  expect(input).toHaveAttribute("data-bwignore");
  expect(input).toHaveAttribute("data-form-type", "other");
  // Still offered to the browser's own one-time-code autofill (e.g. from Mail).
  expect(input).toHaveAttribute("autocomplete", "one-time-code");
});
