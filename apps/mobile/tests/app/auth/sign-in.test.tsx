// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SignIn from "@/app/(app)/(auth)/sign-in";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const signInPasskey = vi.fn<() => Promise<AuthResult>>();
const dismissTo = vi.fn<(href: string) => void>();
const sessionChanged = vi.fn<() => Promise<void>>();
let available = true;

vi.mock("expo-router", () => ({
  router: { dismissTo: (href: string) => dismissTo(href) },
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ name: "Omicron", auth: { signIn: { passkey: signInPasskey } } }),
}));
vi.mock("@/lib/auth/session", () => ({ useSessionChanged: () => sessionChanged }));
vi.mock(import("@/lib/auth/passkeys"), async (original) => ({
  ...(await original()),
  usePasskeysAvailable: () => available,
}));
vi.mock("@/hooks/use-autofill-fields", () => ({ useAutofillFields: () => () => ({}) }));
vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  FormError: ({ message }: { message: string | null }) => (message ? <p role="alert">{message}</p> : null),
}));
vi.mock("@/components/auth/password-input", () => ({ PasswordInput: () => <input aria-label="Password" /> }));
vi.mock("@/components/ui/input", () => ({
  Field: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Input: () => <input aria-label="Username" />,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const passkeyButton = () => screen.getByRole("button", { name: "Sign in with a passkey" });

beforeEach(() => {
  available = true;
  sessionChanged.mockResolvedValue(undefined);
});

describe("signing in with a passkey", () => {
  test("isn't offered where it can't work", () => {
    available = false;
    render(<SignIn />);
    expect(screen.queryByRole("button", { name: "Sign in with a passkey" })).toBeNull();
  });

  test("refreshes the account and goes home", async () => {
    signInPasskey.mockResolvedValue({ data: {} });
    render(<SignIn />);
    fireEvent.click(passkeyButton());
    await waitFor(() => expect(dismissTo).toHaveBeenCalledExactlyOnceWith("/"));
    expect(sessionChanged).toHaveBeenCalledOnce();
  });

  test("a cancel stays put and shows nothing", async () => {
    signInPasskey.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    render(<SignIn />);
    fireEvent.click(passkeyButton());
    expect(await screen.findByRole("button", { name: "Sign in with a passkey" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(dismissTo).not.toHaveBeenCalled();
  });

  test("a device with no passkey says so", async () => {
    signInPasskey.mockResolvedValue({ error: { code: "AUTH_CANCELLED" } });
    render(<SignIn />);
    fireEvent.click(passkeyButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't find a passkey/i);
  });
});
