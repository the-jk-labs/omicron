// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { readable } from "svelte/store";
import { beforeEach, expect, test, vi } from "vitest";
import ResetPasswordPage from "../../../src/routes/reset-password/+page.svelte";

const state = vi.hoisted(() => ({ href: "http://localhost/reset-password?token=tok", pwned: false as boolean | null }));
vi.mock(
  import("$app/stores"),
  () =>
    ({
      get page() {
        return readable({ data: { timeZone: "UTC" }, url: new URL(state.href) });
      },
      navigating: readable(null),
      updated: readable({ current: false }),
    }) as never,
);
const resetPassword = vi.hoisted(() => vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>());
vi.mock("$lib/auth-client", () => ({ authClient: { resetPassword } }));
vi.mock(import("$lib/password"), async (importOriginal) => ({
  ...(await importOriginal()),
  isPwnedPasswordClient: async () => state.pwned,
}));

beforeEach(() => {
  state.href = "http://localhost/reset-password?token=tok";
  state.pwned = false;
});

const GOOD = "A-much-longer-passphrase-1";

async function submit(password: string, confirm = password) {
  await fireEvent.input(screen.getByLabelText("New password"), { target: { value: password } });
  await fireEvent.input(screen.getByLabelText("Confirm password"), { target: { value: confirm } });
  await fireEvent.submit(screen.getByLabelText("New password").closest("form")!);
}

test("sets the new password with the link's token", async () => {
  resetPassword.mockResolvedValue({ error: null });
  render(ResetPasswordPage);
  await submit(GOOD);
  await waitFor(() => screen.getByText("Password updated"));
  expect(resetPassword).toHaveBeenCalledWith({ newPassword: GOOD, token: "tok" });
});

test.for([
  ["too short", "short", "short", /at least 12 characters/],
  ["mismatched", GOOD, `${GOOD}x`, /don't match/],
] as const)("a %s password is refused before any request", async ([, password, confirm, message]) => {
  render(ResetPasswordPage);
  await submit(password, confirm);
  expect(screen.getAllByText(message).length).toBeGreaterThan(0);
  expect(resetPassword).not.toHaveBeenCalled();
});

test("a breached password is refused", async () => {
  state.pwned = true;
  render(ResetPasswordPage);
  await submit(GOOD);
  await waitFor(() => screen.getByText(/appeared in a data breach/));
  expect(resetPassword).not.toHaveBeenCalled();
});

test("an expired link shows the server's reason", async () => {
  resetPassword.mockResolvedValue({ error: { message: "Invalid token" } });
  render(ResetPasswordPage);
  await submit(GOOD);
  await waitFor(() => screen.getByText("Invalid token"));
});

test("without a token the page asks for a new link", () => {
  state.href = "http://localhost/reset-password";
  render(ResetPasswordPage);
  expect(screen.getByText("Link incomplete")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Request a new link" })).toBeInTheDocument();
});
