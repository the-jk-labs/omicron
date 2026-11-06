// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ForgotPassword from "@/app/(app)/(auth)/forgot-password";

let instance: { emailEnabled: boolean; contactEmail: string | null } | undefined;

vi.mock("expo-router", () => ({ router: { replace: vi.fn<() => void>() } }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ origin: "https://blog.test", auth: { requestPasswordReset: vi.fn<() => void>() } }),
}));
vi.mock("@/lib/query/instance", () => ({ useInstanceInfo: () => ({ data: instance }) }));
vi.mock("@/hooks/use-autofill-fields", () => ({ useAutofillFields: () => () => ({}) }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
  FormError: () => null,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>
      {label}
      {children}
    </label>
  ),
  Input: () => <input />,
}));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const COMMAND = "docker compose exec backend deno task reset-admin-password <username>";

beforeEach(() => {
  instance = undefined;
});

describe("ForgotPassword", () => {
  test("with no email, whoever runs the server is given the recovery command", () => {
    instance = { emailEnabled: false, contactEmail: null };
    render(<ForgotPassword />);
    expect(screen.getByText("Do you run this server?")).toBeTruthy();
    expect(screen.getByText(/shell access/)).toBeTruthy();
    expect(screen.getByText(COMMAND)).toBeTruthy();
  });

  test("the command sits alongside the instance's contact address", () => {
    instance = { emailEnabled: false, contactEmail: "admin@blog.test" };
    render(<ForgotPassword />);
    expect(screen.getByText("admin@blog.test")).toBeTruthy();
    expect(screen.getByText(COMMAND)).toBeTruthy();
  });

  test("with email working, it offers the form and not the command", () => {
    instance = { emailEnabled: true, contactEmail: null };
    render(<ForgotPassword />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByText(/reset-admin-password/)).toBeNull();
  });

  test("while the instance is still loading, it doesn't show the command", () => {
    render(<ForgotPassword />);
    expect(screen.queryByText(/reset-admin-password/)).toBeNull();
  });
});
