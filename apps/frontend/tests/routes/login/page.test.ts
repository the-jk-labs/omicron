import { goto, refreshAll } from "$app/navigation";
import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import LoginPage from "../../../src/routes/login/+page.svelte";
import { expectAccessible } from "../../accessibility";

test("accessibility: login", async () => {
  render(LoginPage);
  await expectAccessible();
});

const auth = vi.hoisted(() => ({
  email: vi.fn<(a: unknown) => Promise<{ error?: { message?: string; code?: string } | null }>>(),
  username: vi.fn<(a: unknown) => Promise<{ data?: unknown; error?: { message?: string; code?: string } | null }>>(),
  verifyTotp: vi.fn<(a: unknown) => Promise<{ error?: { message?: string; code?: string } | null }>>(),
  verifyBackupCode: vi.fn<(a: unknown) => Promise<{ error?: { message?: string; code?: string } | null }>>(),
  sendVerificationEmail: vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
  passkey: vi.fn<(a?: unknown) => Promise<{ data?: unknown; error?: { message?: string; code?: string } | null }>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    signIn: { email: auth.email, username: auth.username, passkey: auth.passkey },
    sendVerificationEmail: auth.sendVerificationEmail,
    twoFactor: { verifyTotp: auth.verifyTotp, verifyBackupCode: auth.verifyBackupCode },
  },
}));

async function signIn(identifier: string, password = "correct horse battery") {
  await fireEvent.input(screen.getByLabelText("Username or email"), { target: { value: identifier } });
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: password } });
  await fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
}

test("an email signs in by email, then the app reloads its data and goes home", async () => {
  auth.email.mockResolvedValue({ error: null });
  render(LoginPage);
  await signIn("ada@example.com");
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  expect(auth.email).toHaveBeenCalledWith({ email: "ada@example.com", password: "correct horse battery" });
  expect(refreshAll).toHaveBeenCalled();
});

test("a username signs in by username", async () => {
  auth.username.mockResolvedValue({ error: null });
  render(LoginPage);
  await signIn("ada");
  await waitFor(() =>
    expect(auth.username).toHaveBeenCalledWith({ username: "ada", password: "correct horse battery" }),
  );
});

test("login resumes OAuth consent without authorizing the application automatically", async () => {
  const originalUrl = page.url;
  const target = "/oauth/authorize?client_id=client&scope=read%3Aaccounts&state=opaque";
  page.url = new URL(`http://localhost/login?returnTo=${encodeURIComponent(target)}`);
  try {
    auth.username.mockResolvedValue({ error: null });
    render(LoginPage);
    await signIn("ada");
    await waitFor(() => expect(goto).toHaveBeenCalledWith(target));
  } finally {
    page.url = originalUrl;
  }
});

test("a username typed with a leading @ signs in by username", async () => {
  auth.username.mockResolvedValue({ error: null });
  auth.email.mockResolvedValue({ error: { message: "Invalid email" } });
  render(LoginPage);
  await signIn("@ada");
  await waitFor(() =>
    expect(auth.username).toHaveBeenCalledWith({ username: "ada", password: "correct horse battery" }),
  );
});

test("bad credentials show the server's message", async () => {
  auth.username.mockResolvedValue({ error: { message: "Invalid username or password" } });
  render(LoginPage);
  await signIn("ada", "wrong");
  await waitFor(() => screen.getByText("Invalid username or password"));
  expect(goto).not.toHaveBeenCalled();
});

test("an unverified account is told to check its inbox and can resend the link", async () => {
  auth.email.mockResolvedValue({ error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" } });
  auth.sendVerificationEmail.mockResolvedValue({ error: null });
  render(LoginPage);
  await signIn(" ada@example.com ");
  await waitFor(() => screen.getByText(/Check your inbox to confirm your email/));
  await fireEvent.click(screen.getByRole("button", { name: "Resend confirmation link" }));
  await waitFor(() =>
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith({ email: "ada@example.com", callbackURL: "/verify-email" }),
  );
});

test("clicking Resend doesn't submit the sign-in form again", async () => {
  auth.username.mockResolvedValue({ error: { message: "Please verify your email first" } });
  render(LoginPage);
  await signIn("ada");
  await fireEvent.click(await screen.findByRole("button", { name: "Resend confirmation link" }));
  expect(auth.username).toHaveBeenCalledTimes(1);
});

test("resending needs an email address, not a username", async () => {
  auth.username.mockResolvedValue({ error: { message: "Please verify your email first" } });
  render(LoginPage);
  await signIn("ada");
  const resend = await screen.findByRole("button", { name: "Resend confirmation link" });
  await fireEvent.click(resend);
  await screen.findByText("Enter your email address above to resend the confirmation link.");
  expect(auth.sendVerificationEmail).not.toHaveBeenCalled();
});

test("a thrown network error is shown rather than swallowed", async () => {
  auth.email.mockRejectedValue(new Error("Failed to fetch"));
  render(LoginPage);
  await signIn("ada@example.com");
  await waitFor(() => screen.getByText("Failed to fetch"));
});

function stubWebAuthn(conditional = false) {
  vi.stubGlobal(
    "PublicKeyCredential",
    Object.assign(function PublicKeyCredential() {}, { isConditionalMediationAvailable: async () => conditional }),
  );
}

describe("passkeys", () => {
  // Removing it after hydration shifted the page, so it stays and is disabled.
  test("the passkey button stays, disabled, where the browser has no passkeys", () => {
    render(LoginPage);
    expect(screen.getByRole("button", { name: "This browser doesn't support passkeys" })).toBeDisabled();
  });

  test("the fields ask the password manager to offer passkeys", () => {
    render(LoginPage);
    expect(screen.getByLabelText("Username or email")).toHaveAttribute("autocomplete", "username webauthn");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password webauthn");
  });

  test("picking a passkey from autofill signs in", async () => {
    stubWebAuthn(true);
    auth.passkey.mockResolvedValue({ data: { user: {} }, error: null });
    render(LoginPage);
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(auth.passkey).toHaveBeenCalledWith({ autoFill: true });
    expect(refreshAll).toHaveBeenCalled();
  });

  test("the passkey button signs in", async () => {
    stubWebAuthn();
    auth.passkey.mockResolvedValue({ data: { user: {} }, error: null });
    render(LoginPage);
    await fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(auth.passkey).toHaveBeenCalledWith();
  });

  test("cancelling the passkey prompt says nothing", async () => {
    stubWebAuthn();
    auth.passkey.mockResolvedValue({ data: null, error: { code: "AUTH_CANCELLED", message: "Auth cancelled" } });
    render(LoginPage);
    await fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    await waitFor(() => expect(auth.passkey).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(goto).not.toHaveBeenCalled();
  });

  test("a refused passkey shows why", async () => {
    stubWebAuthn();
    auth.passkey.mockResolvedValue({ data: null, error: { message: "This account has been suspended." } });
    render(LoginPage);
    await fireEvent.click(await screen.findByRole("button", { name: "Sign in with a passkey" }));
    await screen.findByText("This account has been suspended.");
    expect(goto).not.toHaveBeenCalled();
  });
});

const challenge = { data: { twoFactorRedirect: true, twoFactorMethods: ["totp"] }, error: null };
const codeField = () => screen.getByLabelText("Code from your authenticator app");

describe("two-factor sign-in", () => {
  test("a password sign-in on an account with two-factor asks for the app's code, then signs in", async () => {
    auth.username.mockResolvedValue(challenge);
    auth.verifyTotp.mockResolvedValue({ error: null });
    render(LoginPage);
    await signIn("ada");
    expect(goto).not.toHaveBeenCalled();
    await fireEvent.input(await waitFor(codeField), { target: { value: "12 34-56" } });
    expect(codeField()).toHaveValue("123456");
    await fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(auth.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
  });

  test("a password manager can fill the code for the login it saved", async () => {
    auth.username.mockResolvedValue(challenge);
    render(LoginPage);
    await signIn("ada");
    const code = await waitFor(codeField);
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    for (const ignore of ["data-1p-ignore", "data-lpignore", "data-bwignore"]) expect(code).not.toHaveAttribute(ignore);
    expect(code.closest("form")?.querySelector('input[autocomplete="username"]')).toHaveValue("ada");
  });

  test("Verify waits for all six digits", async () => {
    auth.username.mockResolvedValue(challenge);
    render(LoginPage);
    await signIn("ada");
    await fireEvent.input(await waitFor(codeField), { target: { value: "123" } });
    expect(screen.getByRole("button", { name: "Verify" })).toBeDisabled();
  });

  test("a wrong code says so and stays on the code step", async () => {
    auth.username.mockResolvedValue(challenge);
    auth.verifyTotp.mockResolvedValue({ error: { code: "INVALID_CODE", message: "Invalid code" } });
    render(LoginPage);
    await signIn("ada");
    await fireEvent.input(await waitFor(codeField), { target: { value: "000000" } });
    await fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("That code didn't work. Check your authenticator app and try again.");
    expect(codeField()).toBeInTheDocument();
    expect(goto).not.toHaveBeenCalled();
  });

  test("a backup code can stand in for the app", async () => {
    auth.username.mockResolvedValue(challenge);
    auth.verifyBackupCode.mockResolvedValue({ error: null });
    render(LoginPage);
    await signIn("ada");
    await fireEvent.click(await screen.findByRole("button", { name: "Use a backup code" }));
    await fireEvent.input(screen.getByLabelText("Backup code"), { target: { value: "abcde-12345" } });
    await fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(auth.verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345" });
  });

  test("a moderator's backup code is refused with the way back in", async () => {
    auth.username.mockResolvedValue(challenge);
    auth.verifyBackupCode.mockResolvedValue({ error: { code: "BACKUP_CODES_NOT_FOR_STAFF", message: "x" } });
    render(LoginPage);
    await signIn("ada");
    await fireEvent.click(await screen.findByRole("button", { name: "Use a backup code" }));
    await fireEvent.input(screen.getByLabelText("Backup code"), { target: { value: "abcde-12345" } });
    await fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText(/Ask an admin to reset your two-factor authentication/);
  });

  test("an expired second step goes back to the password", async () => {
    auth.username.mockResolvedValue(challenge);
    auth.verifyTotp.mockResolvedValue({ error: { code: "INVALID_TWO_FACTOR_COOKIE" } });
    render(LoginPage);
    await signIn("ada");
    await fireEvent.input(await waitFor(codeField), { target: { value: "123456" } });
    await fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await screen.findByText("This sign-in took too long. Enter your password again.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
