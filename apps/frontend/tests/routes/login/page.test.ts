import { goto, refreshAll } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vitest";
import LoginPage from "../../../src/routes/login/+page.svelte";

const auth = vi.hoisted(() => ({
  email: vi.fn<(a: unknown) => Promise<{ error?: { message?: string; code?: string } | null }>>(),
  username: vi.fn<(a: unknown) => Promise<{ error?: { message?: string; code?: string } | null }>>(),
  sendVerificationEmail: vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
  passkey: vi.fn<(a?: unknown) => Promise<{ data?: unknown; error?: { message?: string; code?: string } | null }>>(),
}));
vi.mock("#lib/auth-client.js", () => ({
  authClient: {
    signIn: { email: auth.email, username: auth.username, passkey: auth.passkey },
    sendVerificationEmail: auth.sendVerificationEmail,
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
  test("no passkey button where the browser has no passkeys", () => {
    render(LoginPage);
    expect(screen.queryByRole("button", { name: "Sign in with a passkey" })).toBeNull();
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
