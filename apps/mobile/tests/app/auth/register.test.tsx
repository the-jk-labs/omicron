import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Register from "@/app/(app)/(auth)/register";

const signUp = vi.fn<(body: Record<string, unknown>) => Promise<{ error: { message: string } | null }>>();
let inviteOnly = false;
let params: { invite?: string } = {};

vi.mock("expo-router", async () => {
  const { Text } = await import("react-native");
  return {
    router: { dismissTo: vi.fn<() => void>() },
    useLocalSearchParams: () => params,
    Link: ({ children }: { children: ReactNode }) => <Text role="link">{children}</Text>,
  };
});
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
vi.mock("@/components/auth/auth-shell", async () => {
  const { Text, View } = await import("react-native");
  return {
    AuthShell: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    FormError: ({ message }: { message: string | null }) =>
      message ? (
        <Text role="alert" accessible>
          {message}
        </Text>
      ) : null,
  };
});
vi.mock("@/components/auth/password-input", async () => ({
  PasswordInput: (await import("../../support/field")).Input,
}));
vi.mock("@/components/auth/password-strength", () => ({ PasswordStrength: () => null }));
vi.mock("@/components/ui/button", async () => {
  const { Pressable, Text } = await import("react-native");
  return {
    Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
      <Pressable role="button" onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});
vi.mock("@/components/ui/checkbox", async () => {
  const { Pressable, Text } = await import("react-native");
  return {
    Checkbox: ({ onCheckedChange }: { onCheckedChange: (checked: boolean) => void }) => (
      <Pressable role="button" onPress={() => onCheckedChange(true)}>
        <Text>Accept terms</Text>
      </Pressable>
    ),
  };
});
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/input", async () => {
  const { Field, Input } = await import("../../support/field");
  return { Field, Input };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

const type = (label: string, value: string) => fireEvent.changeText(screen.getByLabelText(label), value);

async function fillIn() {
  await type("Username", "new_user");
  await type("Email", "new@test.dev");
  await type("Password", "correct-horse-battery-staple-12");
  await type("Confirm password", "correct-horse-battery-staple-12");
  await fireEvent.press(screen.getByRole("button", { name: "Accept terms" }));
  await fireEvent.press(screen.getByRole("button", { name: /Create account/ }));
}

beforeEach(() => {
  inviteOnly = false;
  params = {};
  signUp.mockResolvedValue({ error: null });
});

describe("Register", () => {
  test("an open instance asks for no invite and sends none", async () => {
    await render(<Register />);
    expect(screen.queryByLabelText(/Invite/)).toBeNull();
    await fillIn();
    await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
    expect(signUp.mock.calls[0]?.[0]).not.toHaveProperty("inviteToken");
  });

  test("an invite-only instance won't submit without one", async () => {
    inviteOnly = true;
    await render(<Register />);
    await fillIn();
    expect(screen.getByRole("alert")).toHaveTextContent(/invite link or code/);
    expect(signUp).not.toHaveBeenCalled();
  });

  test("a pasted invite link goes along as its code", async () => {
    inviteOnly = true;
    await render(<Register />);
    await type("Invite", "https://blog.test/register?invite=abc123");
    await fillIn();
    await waitFor(() => expect(signUp).toHaveBeenCalledOnce());
    expect(signUp.mock.calls[0]?.[0]).toMatchObject({ inviteToken: "abc123" });
  });

  test("a link into the screen fills the invite in", async () => {
    inviteOnly = true;
    params = { invite: "abc123" };
    await render(<Register />);
    expect(screen.getByLabelText("Invite")).toHaveDisplayValue("abc123");
  });

  test("a refused invite shows the server's reason", async () => {
    inviteOnly = true;
    signUp.mockResolvedValue({ error: { message: "That invite has been used." } });
    await render(<Register />);
    await type("Invite", "old");
    await fillIn();
    expect(await screen.findByRole("alert")).toHaveTextContent(/has been used/);
  });
});
