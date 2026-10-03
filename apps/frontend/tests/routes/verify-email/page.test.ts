import { refreshAll } from "$app/navigation";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import VerifyEmailPage from "../../../src/routes/verify-email/+page.svelte";

const state = vi.hoisted(() => ({
  href: "http://localhost/verify-email?token=tok",
  data: {} as Record<string, unknown>,
}));
vi.mock(
  import("$app/state"),
  () =>
    ({
      get page() {
        return { data: state.data, url: new URL(state.href) };
      },
      navigating: null,
      updated: { current: false },
    }) as never,
);
const auth = vi.hoisted(() => ({
  verifyEmail: vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
  sendVerificationEmail: vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
}));
vi.mock("#lib/auth-client.js", () => ({ authClient: auth }));

beforeEach(() => {
  state.href = "http://localhost/verify-email?token=tok";
  state.data = {};
});

test("a valid link confirms the email and refreshes the session", async () => {
  auth.verifyEmail.mockResolvedValue({ error: null });
  render(VerifyEmailPage);
  await waitFor(() => screen.getByText("Email confirmed"));
  expect(auth.verifyEmail).toHaveBeenCalledWith({ query: { token: "tok" } });
  expect(refreshAll).toHaveBeenCalled();
});

test("a bad link explains and offers a new one", async () => {
  auth.verifyEmail.mockResolvedValue({ error: { message: "Token expired" } });
  render(VerifyEmailPage);
  await waitFor(() => screen.getByText("Link didn't work"));
  expect(screen.getByText("Token expired")).toBeInTheDocument();
});

test("a network failure while verifying shows the error view", async () => {
  auth.verifyEmail.mockRejectedValue(new TypeError("Failed to fetch"));
  render(VerifyEmailPage);
  await waitFor(() => screen.getByText("Link didn't work"), { timeout: 500 });
});

test("without a token it offers to resend, and confirms once sent", async () => {
  state.href = "http://localhost/verify-email";
  auth.sendVerificationEmail.mockResolvedValue({ error: null });
  render(VerifyEmailPage);
  expect(auth.verifyEmail).not.toHaveBeenCalled();
  await fireEvent.input(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
  await fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
  await waitFor(() => screen.getByText("Check your inbox"));
  expect(auth.sendVerificationEmail).toHaveBeenCalledWith({ email: "ada@example.com", callbackURL: "/verify-email" });
});

test("a resend failure is shown", async () => {
  state.href = "http://localhost/verify-email";
  auth.sendVerificationEmail.mockResolvedValue({ error: { message: "Slow down" } });
  render(VerifyEmailPage);
  await fireEvent.input(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
  await fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
  await waitFor(() => screen.getByText("Slow down"));
});

test("an instance that can't send email says so", () => {
  state.href = "http://localhost/verify-email";
  state.data = { instance: { emailEnabled: false } };
  render(VerifyEmailPage);
  expect(screen.getByText("This instance can't send email")).toBeInTheDocument();
});
