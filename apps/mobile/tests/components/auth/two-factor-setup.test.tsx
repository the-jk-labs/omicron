import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { ReactNode } from "react";
import { Linking } from "react-native";
import { beforeEach, expect, test, vi } from "vitest";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const enable = vi.fn<(body: unknown) => Promise<AuthResult>>();
const verifyTotp = vi.fn<(body: unknown) => Promise<AuthResult>>();

vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn<(text: string) => Promise<boolean>>() }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ auth: { twoFactor: { enable, verifyTotp } } }),
}));
vi.mock("@/hooks/use-autofill-fields", () => ({ useAutofillFields: () => () => ({}) }));
vi.mock("@/components/auth/auth-shell", async () => {
  const { Text } = await import("react-native");
  return {
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
    Button: ({ children, onPress, disabled }: { children: ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable role="button" onPress={onPress} disabled={disabled}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

const URI = "otpauth://totp/Omicron:ada?secret=JBSWY3DPEHPK3PXP&issuer=Omicron";

beforeEach(() => {
  enable.mockResolvedValue({ data: { method: "totp", totpURI: URI, backupCodes: ["aaaaa-11111"] }, error: null });
  verifyTotp.mockResolvedValue({ data: {}, error: null });
});

async function toScan(staff: boolean) {
  const onDone = vi.fn<() => void>();
  await render(<TwoFactorSetup staff={staff} onDone={onDone} />);
  await fireEvent.changeText(screen.getByLabelText("Password"), "secret");
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByLabelText("6-digit code from the app");
  return onDone;
}

test("password, then a code from the app turns it on and shows the backup codes", async () => {
  const onDone = await toScan(false);
  expect(enable).toHaveBeenCalledWith({ password: "secret" });
  expect(screen.getByLabelText("QR code for your authenticator app")).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText("6-digit code from the app"), "123456");
  await fireEvent.press(screen.getByRole("button", { name: "Turn on" }));
  expect(await screen.findByText("aaaaa-11111")).toBeOnTheScreen();
  expect(verifyTotp).toHaveBeenCalledWith({ code: "123456" });
  await fireEvent.press(screen.getByRole("button", { name: "I've saved them" }));
  expect(onDone).toHaveBeenCalledOnce();
});

test("staff are done once the code is confirmed, with no backup codes", async () => {
  enable.mockResolvedValue({ data: { method: "totp", totpURI: URI, backupCodes: [] }, error: null });
  const onDone = await toScan(true);
  await fireEvent.changeText(screen.getByLabelText("6-digit code from the app"), "123456");
  await fireEvent.press(screen.getByRole("button", { name: "Turn on" }));
  await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  expect(screen.queryByText("aaaaa-11111")).toBeNull();
});

// On a phone the authenticator usually lives on the same device, so a QR code alone wouldn't do.
test("the otpauth link hands the account to an authenticator or password manager on this phone", async () => {
  const open = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  await toScan(false);
  await fireEvent.press(screen.getByRole("button", { name: "Open in authenticator app" }));
  expect(open).toHaveBeenCalledWith(URI);
});

test("the key can be copied to type in by hand", async () => {
  await toScan(false);
  await fireEvent.press(screen.getByRole("button", { name: "JBSW Y3DP EHPK 3PXP" }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith("JBSWY3DPEHPK3PXP");
});

test("the code field invites password managers to fill it", async () => {
  await toScan(false);
  const code = screen.getByLabelText("6-digit code from the app");
  expect(code).toHaveProp("autoComplete", "one-time-code");
  expect(code).toHaveProp("textContentType", "oneTimeCode");
});

test("a wrong password stays put and says so", async () => {
  enable.mockResolvedValue({ error: { code: "INVALID_PASSWORD" } });
  await render(<TwoFactorSetup staff={false} onDone={vi.fn<() => void>()} />);
  await fireEvent.changeText(screen.getByLabelText("Password"), "nope");
  await fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("That password isn't right.");
});

test("a wrong code keeps the setup up to try again", async () => {
  verifyTotp.mockResolvedValue({ error: { code: "INVALID_CODE" } });
  const onDone = await toScan(false);
  await fireEvent.changeText(screen.getByLabelText("6-digit code from the app"), "000000");
  await fireEvent.press(screen.getByRole("button", { name: "Turn on" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/code didn't work/);
  expect(onDone).not.toHaveBeenCalled();
});
