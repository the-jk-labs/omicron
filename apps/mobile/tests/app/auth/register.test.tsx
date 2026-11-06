// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Register from "@/app/(app)/(auth)/register";

const signUp = vi.fn<(body: Record<string, unknown>) => Promise<{ error: { message: string } | null }>>();
let inviteOnly = false;
let params: { invite?: string } = {};

vi.mock("expo-router", () => ({
  router: { dismissTo: vi.fn<() => void>() },
  useLocalSearchParams: () => params,
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ name: "Omicron", auth: { signUp: { email: signUp } } }),
}));
vi.mock("@/lib/query/instance", () => ({
  useInstanceInfo: () => ({ data: { inviteOnly, emailVerificationRequired: true } }),
}));
vi.mock("@/lib/auth/session", () => ({ useSessionChanged: () => vi.fn<() => Promise<void>>() }));
vi.mock(import("@/lib/auth/password"), async (original) => ({
  ...(await original()),
  isPwnedPassword: async () => false,
}));
vi.mock("@/hooks/use-autofill-fields", () => ({ useAutofillFields: () => () => ({}) }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FormError: ({ message }: { message: string | null }) => (message ? <p role="alert">{message}</p> : null),
}));
vi.mock("@/components/auth/password-input", () => ({
  PasswordInput: ({
    value,
    onChangeText,
    placeholder,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
  }) => <input value={value} placeholder={placeholder} onChange={(event) => onChangeText(event.target.value)} />,
}));
vi.mock("@/components/auth/password-strength", () => ({ PasswordStrength: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ onCheckedChange }: { onCheckedChange: (checked: boolean) => void }) => (
    <button type="button" onClick={() => onCheckedChange(true)}>
      Accept terms
    </button>
  ),
}));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  ),
  Input: ({
    value,
    onChangeText,
    placeholder,
  }: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
  }) => <input value={value} placeholder={placeholder} onChange={(event) => onChangeText(event.target.value)} />,
}));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillIn() {
  type("Username", "new_user");
  type("Email", "new@test.dev");
  type("Password", "correct-horse-battery-staple-12");
  type("Confirm password", "correct-horse-battery-staple-12");
  fireEvent.click(screen.getByRole("button", { name: "Accept terms" }));
  fireEvent.click(screen.getByRole("button", { name: /Create account/ }));
}

beforeEach(() => {
  inviteOnly = false;
  params = {};
  signUp.mockResolvedValue({ error: null });
});

describe("Register", () => {
  test("an open instance asks for no invite and sends none", async () => {
    render(<Register />);
    expect(screen.queryByLabelText(/Invite/)).toBeNull();
    fillIn();
    await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
    expect(signUp.mock.calls[0]?.[0]).not.toHaveProperty("inviteToken");
  });

  test("an invite-only instance won't submit without one", () => {
    inviteOnly = true;
    render(<Register />);
    fillIn();
    expect(screen.getByRole("alert").textContent).toMatch(/invite link or code/);
    expect(signUp).not.toHaveBeenCalled();
  });

  test("a pasted invite link goes along as its code", async () => {
    inviteOnly = true;
    render(<Register />);
    type("Invite", "https://blog.test/register?invite=abc123");
    fillIn();
    await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
    expect(signUp.mock.calls[0]?.[0]).toMatchObject({ inviteToken: "abc123" });
  });

  test("a link into the screen fills the invite in", () => {
    inviteOnly = true;
    params = { invite: "abc123" };
    render(<Register />);
    expect(screen.getByLabelText<HTMLInputElement>("Invite").value).toBe("abc123");
  });

  test("a refused invite shows the server's reason", async () => {
    inviteOnly = true;
    signUp.mockResolvedValue({ error: { message: "That invite has been used." } });
    render(<Register />);
    type("Invite", "old");
    fillIn();
    expect((await screen.findByRole("alert")).textContent).toContain("has been used");
  });
});
