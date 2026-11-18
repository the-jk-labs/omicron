import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { PasskeyPrompt } from "@/components/auth/passkey-prompt";
import { dismissPasskeyPrompt, passkeyPromptDismissed, resetPasskeyPrompt } from "@/lib/auth/passkey-prompt";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const ORIGIN = "https://omicron.test";
const list = vi.fn<() => Promise<AuthResult>>();
const add = vi.fn<() => Promise<AuthResult>>();
const present = vi.fn<() => void>();
const dismiss = vi.fn<() => void>();
const push = vi.fn<(href: unknown) => void>();
let available = true;
let userId: string | null = "ada";
let dismissSheet = () => {};

vi.mock("expo-router", () => ({
  router: { push: (href: unknown) => push(href) },
  useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
}));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ origin: ORIGIN, auth: { passkey: { listUserPasskeys: list, addPasskey: add } } }),
}));
vi.mock("@/lib/auth/session", () => ({ useViewer: () => ({ user: userId ? { id: userId } : null }) }));
vi.mock(import("@/lib/auth/passkeys"), async (original) => ({
  ...(await original()),
  usePasskeysAvailable: () => available,
}));
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
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
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
vi.mock("@/components/ui/sheet", async () => {
  const { View } = await import("react-native");
  return {
    useSheet: () => ({ ref: { current: null }, present: () => present(), dismiss: () => dismiss() }),
    Sheet: ({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) => {
      dismissSheet = onDismiss;
      return <View>{children}</View>;
    },
  };
});

async function renderPrompt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <PasskeyPrompt />
    </QueryClientProvider>,
  );
}

/** Lets the passkey list load and the offer's delay pass. */
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });

beforeEach(() => {
  vi.useFakeTimers();
  available = true;
  userId = "ada";
  resetPasskeyPrompt(ORIGIN);
  list.mockResolvedValue({ data: [] });
  add.mockResolvedValue({ data: {} });
  return () => vi.useRealTimers();
});

const pressAdd = async () => {
  await renderPrompt();
  await settle();
  await fireEvent.press(screen.getByRole("button", { name: "Add a passkey" }));
  await settle();
};

describe("when it offers", () => {
  test("offers someone with no passkey, after Home has appeared", async () => {
    await renderPrompt();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(present).not.toHaveBeenCalled();
    await settle();
    expect(present).toHaveBeenCalledOnce();
  });

  test("stays quiet for someone who has one", async () => {
    list.mockResolvedValue({ data: [{ id: "a", backedUp: true, createdAt: "2026-11-01T00:00:00Z" }] });
    await renderPrompt();
    await settle();
    expect(present).not.toHaveBeenCalled();
  });

  test("stays quiet where passkeys can't work", async () => {
    available = false;
    await renderPrompt();
    await settle();
    expect(list).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();
  });

  test("stays quiet once dismissed, until the next sign-in", async () => {
    dismissPasskeyPrompt(ORIGIN);
    await renderPrompt();
    await settle();
    expect(present).not.toHaveBeenCalled();
  });

  test("stays quiet for a guest", async () => {
    userId = null;
    await renderPrompt();
    await settle();
    expect(list).not.toHaveBeenCalled();
  });

  test("stays quiet if the list can't load", async () => {
    list.mockResolvedValue({ error: { message: "Nope" } });
    await renderPrompt();
    await settle();
    expect(present).not.toHaveBeenCalled();
  });

  test("leaving Home during the delay cancels it", async () => {
    const { unmount } = await renderPrompt();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await unmount();
    await vi.advanceTimersByTimeAsync(2000);
    expect(present).not.toHaveBeenCalled();
  });
});

describe("what it does", () => {
  test("adding moves on to the confirmation", async () => {
    await pressAdd();
    expect(screen.getByText("Passkey added")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Done" }));
    expect(dismiss).toHaveBeenCalledOnce();
  });

  test("an old sign-in goes to the screen that asks for the password", async () => {
    add.mockResolvedValue({ error: { code: "SESSION_NOT_FRESH" } });
    await pressAdd();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledExactlyOnceWith({ pathname: "/settings/passkeys", params: { confirm: "1" } });
  });

  test("a cancel leaves the offer as it was", async () => {
    add.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    await pressAdd();
    expect(screen.getByText("Sign in faster with a passkey")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a failure says why", async () => {
    add.mockResolvedValue({ error: { code: "ERROR_INVALID_RP_ID" } });
    await pressAdd();
    expect(screen.getByRole("alert")).toHaveTextContent(/hasn't enabled passkeys/i);
  });

  test("closing it is remembered", async () => {
    await renderPrompt();
    await settle();
    dismissSheet();
    expect(passkeyPromptDismissed(ORIGIN)).toBe(true);
  });
});
