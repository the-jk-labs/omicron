import { render, screen } from "@testing-library/react-native";
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
vi.mock("@/components/auth/auth-shell", async () => {
  const { Text, View } = await import("react-native");
  return {
    AuthShell: ({ title, children }: { title: string; children: ReactNode }) => (
      <View>
        <Text role="heading">{title}</Text>
        {children}
      </View>
    ),
    FormError: () => null,
  };
});
vi.mock("@/components/ui/button", async () => {
  const { Pressable, Text } = await import("react-native");
  return {
    Button: ({ children }: { children: ReactNode }) => (
      <Pressable role="button">
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});
vi.mock("@/components/ui/input", async () => {
  const { Field, Input } = await import("../../support/field");
  return { Field, Input };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

const COMMAND = "docker compose exec backend deno task reset-admin-password <username>";

beforeEach(() => {
  instance = undefined;
});

describe("ForgotPassword", () => {
  test("with no email, whoever runs the server is given the recovery command", async () => {
    instance = { emailEnabled: false, contactEmail: null };
    await render(<ForgotPassword />);
    expect(screen.getByText("Do you run this server?")).toBeTruthy();
    expect(screen.getByText(/shell access/)).toBeTruthy();
    expect(screen.getByText(COMMAND)).toBeTruthy();
  });

  test("the command sits alongside the instance's contact address", async () => {
    instance = { emailEnabled: false, contactEmail: "admin@blog.test" };
    await render(<ForgotPassword />);
    expect(screen.getByText("admin@blog.test")).toBeTruthy();
    expect(screen.getByText(COMMAND)).toBeTruthy();
  });

  test("with email working, it offers the form and not the command", async () => {
    instance = { emailEnabled: true, contactEmail: null };
    await render(<ForgotPassword />);
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByText(/reset-admin-password/)).toBeNull();
  });

  test("while the instance is still loading, it doesn't show the command", async () => {
    await render(<ForgotPassword />);
    expect(screen.queryByText(/reset-admin-password/)).toBeNull();
  });
});
