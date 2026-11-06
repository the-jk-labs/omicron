import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import ForgotPasswordPage from "../../../src/routes/forgot-password/+page.svelte";
import { expectAccessible } from "../../accessibility";

test("accessibility: password recovery", async () => {
  render(ForgotPasswordPage);
  await expectAccessible();
});

const requestPasswordReset = vi.hoisted(() =>
  vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
);
vi.mock("#lib/auth-client.js", () => ({ authClient: { requestPasswordReset } }));

afterEach(() => {
  Object.assign(page.data, { instance: undefined });
});

async function request(email: string) {
  await fireEvent.input(screen.getByLabelText("Email"), { target: { value: email } });
  await fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
}

test("requests a reset link back to this origin and confirms", async () => {
  requestPasswordReset.mockResolvedValue({ error: null });
  render(ForgotPasswordPage);
  await request("ada@example.com");
  await waitFor(() => screen.getByText("Check your inbox"));
  expect(requestPasswordReset).toHaveBeenCalledWith({
    email: "ada@example.com",
    redirectTo: `${location.origin}/reset-password`,
  });
});

test("errors are shown", async () => {
  requestPasswordReset.mockResolvedValue({ error: { message: "Too many requests" } });
  render(ForgotPasswordPage);
  await request("ada@example.com");
  await waitFor(() => screen.getByText("Too many requests"));
});

test("accessibility: the no-email page with its recovery note", async () => {
  Object.assign(page.data, { instance: { emailEnabled: false } });
  render(ForgotPasswordPage);
  await expectAccessible();
});

test("with no email, whoever runs the server is given the recovery command", () => {
  Object.assign(page.data, { instance: { emailEnabled: false } });
  render(ForgotPasswordPage);
  expect(screen.getByRole("heading", { name: "Do you run this server?" })).toBeInTheDocument();
  expect(screen.getByText(/shell\s+access/)).toBeInTheDocument();
  expect(screen.getByText("docker compose exec backend deno task reset-admin-password <username>")).toBeInTheDocument();
});

test("with email working, the recovery command stays out of sight", () => {
  Object.assign(page.data, { instance: { emailEnabled: true } });
  render(ForgotPasswordPage);
  expect(screen.queryByText(/reset-admin-password/)).toBe(null);
});

test("an instance that hasn't said whether it has email doesn't show the command", () => {
  render(ForgotPasswordPage);
  expect(screen.queryByText(/reset-admin-password/)).toBe(null);
});

test("an instance that can't send email says so instead of offering the form", () => {
  Object.assign(page.data, { instance: { emailEnabled: false } });
  render(ForgotPasswordPage);
  expect(screen.getByText("This instance can't send email")).toBeInTheDocument();
  expect(screen.queryByLabelText("Email")).toBe(null);
});
