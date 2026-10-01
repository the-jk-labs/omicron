// SPDX-License-Identifier: AGPL-3.0-or-later
import { goto, invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import type * as passwordHelpers from "$lib/password";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RegisterPage from "../../../src/routes/register/+page.svelte";

const { signUp } = vi.hoisted(() => ({ signUp: vi.fn() }));
vi.mock("$lib/auth-client", () => ({
  authClient: { signUp: { email: signUp }, sendVerificationEmail: vi.fn() },
}));
vi.mock("$lib/password", async (importOriginal) => ({
  ...(await importOriginal<typeof passwordHelpers>()),
  isPwnedPasswordClient: () => Promise.resolve(false),
}));

async function fillRegistration() {
  await fireEvent.input(screen.getByLabelText("Username"), { target: { value: "new_user" } });
  await fireEvent.input(screen.getByLabelText("Email"), { target: { value: " Taken@Example.com " } });
  await fireEvent.input(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "Unique-test-password-123!" },
  });
  await fireEvent.input(screen.getByLabelText("Confirm password"), {
    target: { value: "Unique-test-password-123!" },
  });
  await fireEvent.click(screen.getByRole("checkbox"));
  await fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(page.data, { instance: { emailVerificationRequired: true } });
  });

  it("keeps duplicate emails on the form with account recovery links", async () => {
    signUp.mockResolvedValue({ error: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "Duplicate email" } });
    render(RegisterPage);
    await fillRegistration();

    expect(await screen.findByRole("alert")).toHaveTextContent("This email is already registered.");
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
    expect(screen.getByRole("link", { name: "Reset password" })).toHaveAttribute("href", "/forgot-password");
    expect(
      screen.getAllByRole("link", { name: "Sign in" }).every((link) => link.getAttribute("href") === "/login"),
    ).toBe(true);
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue("new_user");
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "taken@example.com" }));
    expect(goto).not.toHaveBeenCalled();

    await fireEvent.input(email, { target: { value: "new@example.com" } });
    expect(email).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();

    signUp.mockResolvedValue({ data: { token: null, user: { email: "new@example.com" } }, error: null });
    await fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText("new@example.com")).toBeInTheDocument();
  });

  it("shows other registration failures without claiming an email was sent", async () => {
    signUp.mockResolvedValue({ error: { code: "USERNAME_IS_ALREADY_TAKEN", message: "Username is already taken" } });
    render(RegisterPage);
    await fillRegistration();

    expect(await screen.findByRole("alert")).toHaveTextContent("Username is already taken");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).not.toBeInTheDocument();
  });

  it("signs in immediately after a successful registration when confirmation is optional", async () => {
    Object.assign(page.data, { instance: { emailVerificationRequired: false } });
    signUp.mockResolvedValue({ data: { token: "session-token" }, error: null });
    render(RegisterPage);
    await fillRegistration();

    await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
    expect(invalidateAll).toHaveBeenCalledOnce();
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).not.toBeInTheDocument();
  });
});
