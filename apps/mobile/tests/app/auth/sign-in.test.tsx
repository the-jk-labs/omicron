import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SignIn from "@/app/(app)/(auth)/sign-in";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const signInPasskey = vi.fn<() => Promise<AuthResult>>();
const signInUsername = vi.fn<(body: unknown) => Promise<AuthResult>>();
const verifyTotp = vi.fn<(body: unknown) => Promise<AuthResult>>();
const verifyBackupCode = vi.fn<(body: unknown) => Promise<AuthResult>>();
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
  useInstance: () => ({
    name: "Omicron",
    auth: {
      signIn: { passkey: signInPasskey, username: signInUsername },
      twoFactor: { verifyTotp, verifyBackupCode },
    },
  }),
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
vi.mock("@/components/auth/password-input", async () => ({
  PasswordInput: (await import("../../support/field")).Input,
}));
vi.mock("@/components/ui/input", async () => {
  const { Field, Input } = await import("../../support/field");
  return { Field, Input };
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

describe("two-factor sign-in", () => {
  const challenge = { data: { twoFactorRedirect: true, twoFactorMethods: ["totp"] }, error: null };

  async function passwordStep() {
    signInUsername.mockResolvedValue(challenge);
    await render(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText("Username or email"), "ada");
    await fireEvent.changeText(screen.getByLabelText("Password"), "correct horse battery");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    return screen.findByLabelText("Code from your authenticator app");
  }

  test("a password on an account with two-factor asks for the app's code, then signs in", async () => {
    verifyTotp.mockResolvedValue({ data: {}, error: null });
    const code = await passwordStep();
    expect(dismissTo).not.toHaveBeenCalled();
    await fireEvent.changeText(code, "12 34-56");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(dismissTo).toHaveBeenCalledExactlyOnceWith("/"));
    expect(verifyTotp).toHaveBeenCalledWith({ code: "123456" });
    expect(sessionChanged).toHaveBeenCalledOnce();
  });

  // Android password managers (1Password, Bitwarden) and iOS fill a field marked as a one-time code.
  test("the code field invites password managers to fill it", async () => {
    const code = await passwordStep();
    expect(code).toHaveProp("autoComplete", "one-time-code");
    expect(code).toHaveProp("textContentType", "oneTimeCode");
  });

  test("a wrong code says so and stays on the code", async () => {
    verifyTotp.mockResolvedValue({ error: { code: "INVALID_CODE" } });
    await fireEvent.changeText(await passwordStep(), "000000");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/code didn't work/);
    expect(screen.getByLabelText("Code from your authenticator app")).toBeOnTheScreen();
    expect(dismissTo).not.toHaveBeenCalled();
  });

  test("a backup code can stand in for the app", async () => {
    verifyBackupCode.mockResolvedValue({ data: {}, error: null });
    await passwordStep();
    await fireEvent.press(screen.getByRole("button", { name: "Use a backup code" }));
    await fireEvent.changeText(screen.getByLabelText("Backup code"), "abcde-12345");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(dismissTo).toHaveBeenCalledOnce());
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345" });
  });

  test("an expired second step goes back to the password", async () => {
    verifyTotp.mockResolvedValue({ error: { code: "INVALID_TWO_FACTOR_COOKIE" } });
    await fireEvent.changeText(await passwordStep(), "123456");
    await fireEvent.press(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/took too long/);
    expect(screen.getByLabelText("Password")).toBeOnTheScreen();
  });
});
