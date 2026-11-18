import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SignIn from "@/app/(app)/(auth)/sign-in";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const signInPasskey = vi.fn<() => Promise<AuthResult>>();
const dismissTo = vi.fn<(href: string) => void>();
const sessionChanged = vi.fn<() => Promise<void>>();
let available = true;

vi.mock("expo-router", async () => {
  const { Text } = await import("react-native");
  return {
    router: { dismissTo: (href: string) => dismissTo(href) },
    useLocalSearchParams: () => ({}),
    Link: ({ children }: { children: ReactNode }) => <Text role="link">{children}</Text>,
  };
});
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ name: "Omicron", auth: { signIn: { passkey: signInPasskey } } }),
}));
vi.mock("@/lib/auth/session", () => ({ useSessionChanged: () => sessionChanged }));
vi.mock(import("@/lib/auth/passkeys"), async (original) => ({
  ...(await original()),
  usePasskeysAvailable: () => available,
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
vi.mock("@/components/auth/password-input", async () => {
  const { TextInput } = await import("react-native");
  return { PasswordInput: () => <TextInput aria-label="Password" /> };
});
vi.mock("@/components/ui/input", async () => {
  const { TextInput, View } = await import("react-native");
  return {
    Field: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    Input: () => <TextInput aria-label="Username" />,
  };
});
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
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

const passkeyButton = () => screen.getByRole("button", { name: "Sign in with a passkey" });

beforeEach(() => {
  available = true;
  sessionChanged.mockResolvedValue(undefined);
});

describe("signing in with a passkey", () => {
  test("isn't offered where it can't work", async () => {
    available = false;
    await render(<SignIn />);
    expect(screen.queryByRole("button", { name: "Sign in with a passkey" })).toBeNull();
  });

  test("refreshes the account and goes home", async () => {
    signInPasskey.mockResolvedValue({ data: {} });
    await render(<SignIn />);
    await fireEvent.press(passkeyButton());
    await waitFor(() => expect(dismissTo).toHaveBeenCalledExactlyOnceWith("/"));
    expect(sessionChanged).toHaveBeenCalledOnce();
  });

  test("a cancel stays put and shows nothing", async () => {
    signInPasskey.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    await render(<SignIn />);
    await fireEvent.press(passkeyButton());
    expect(await screen.findByRole("button", { name: "Sign in with a passkey" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(dismissTo).not.toHaveBeenCalled();
  });

  test("a device with no passkey says so", async () => {
    signInPasskey.mockResolvedValue({ error: { code: "AUTH_CANCELLED" } });
    await render(<SignIn />);
    await fireEvent.press(passkeyButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't find a passkey/i);
  });
});
