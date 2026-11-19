import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as WebBrowser from "expo-web-browser";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Passkeys from "@/app/(app)/settings/passkeys";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const list = vi.fn<() => Promise<AuthResult>>();
const add = vi.fn<() => Promise<AuthResult>>();
const update = vi.fn<(body: unknown) => Promise<AuthResult>>();
const remove = vi.fn<(body: unknown) => Promise<AuthResult>>();
const askConfirm = vi.fn<(options: unknown) => Promise<boolean>>();
let available = true;
let params: { confirm?: string } = {};

vi.mock("expo-router", () => ({ useLocalSearchParams: () => params }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn<() => void>() }));
vi.mock("@/hooks/use-refresh-on-focus", () => ({ useRefreshOnFocus: () => undefined }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({
    origin: "https://omicron.test",
    auth: { passkey: { listUserPasskeys: list, addPasskey: add, updatePasskey: update, deletePasskey: remove } },
  }),
}));
vi.mock(import("@/lib/auth/passkeys"), async (original) => ({
  ...(await original()),
  usePasskeysAvailable: () => available,
}));
vi.mock("@/lib/dialogs/confirm", () => ({ confirm: (options: unknown) => askConfirm(options) }));
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
vi.mock("@/components/settings/form-screen", async () => {
  const { Text, View } = await import("react-native");
  return {
    FormScreen: ({ title, children }: { title: string; children: ReactNode }) => (
      <View>
        <Text role="heading">{title}</Text>
        {children}
      </View>
    ),
  };
});
vi.mock("@/components/settings/confirm-password-form", async () => {
  const { Pressable, Text } = await import("react-native");
  return {
    ConfirmPasswordForm: ({ onConfirmed }: { onConfirmed: () => void }) => (
      <Pressable role="button" onPress={onConfirmed}>
        <Text>Password confirmed</Text>
      </Pressable>
    ),
  };
});
vi.mock("@/components/settings/settings-row", async () => {
  const { Text, View } = await import("react-native");
  return {
    SettingsSection: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    SettingsRow: ({ label, detail, trailing }: { label: string; detail?: string; trailing?: ReactNode }) => (
      <View>
        <Text>
          {label} {detail}
        </Text>
        {trailing}
      </View>
    ),
  };
});
vi.mock("@/components/ui/button", async () => {
  const { Pressable, Text } = await import("react-native");
  return {
    Button: ({ children, onPress, disabled }: { children: ReactNode; onPress?: () => void; disabled?: boolean }) => (
      <Pressable role="button" disabled={disabled} onPress={onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    IconButton: ({ label, onPress }: { label: string; onPress?: () => void }) => (
      <Pressable role="button" aria-label={label} onPress={onPress} />
    ),
  };
});
vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return {
    Input: ({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) => (
      <TextInput aria-label="Passkey name" value={value} onChangeText={onChangeText} />
    ),
  };
});
vi.mock("@/components/ui/spinner", async () => ({ Spinner: (await import("react-native")).ActivityIndicator }));
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

const pixel = { id: "a", name: "Pixel", backedUp: true, createdAt: "2026-11-01T00:00:00Z" };
const addButton = () => screen.findByRole("button", { name: "Add a passkey" });

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={client}>
      <Passkeys />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  available = true;
  params = {};
  list.mockResolvedValue({ data: [pixel] });
  add.mockResolvedValue({ data: {} });
  update.mockResolvedValue({ data: {} });
  remove.mockResolvedValue({ data: {} });
  askConfirm.mockResolvedValue(true);
});

const startRename = async () => fireEvent.press(await screen.findByRole("button", { name: "Rename Pixel" }));

const pressRemove = async () => fireEvent.press(await screen.findByRole("button", { name: "Remove Pixel" }));

describe("the list", () => {
  test("shows each passkey as the web does", async () => {
    await renderScreen();
    expect(await screen.findByText(/Pixel Synced · Added/)).toBeTruthy();
  });

  test("says when there are none", async () => {
    list.mockResolvedValue({ data: [] });
    await renderScreen();
    expect(await screen.findByText("No passkeys yet.")).toBeTruthy();
  });

  test("says when it can't load rather than looking empty", async () => {
    list.mockResolvedValue({ error: { message: "Database is down" } });
    await renderScreen();
    expect(await screen.findByText(/database is down/i)).toBeTruthy();
  });
});

describe("adding", () => {
  test("reloads the list once added", async () => {
    await renderScreen();
    await fireEvent.press(await addButton());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(add).toHaveBeenCalledOnce();
  });

  test("an old sign-in asks for the password, then carries on adding", async () => {
    add.mockResolvedValueOnce({ error: { code: "SESSION_NOT_FRESH" } });
    await renderScreen();
    await fireEvent.press(await addButton());

    await fireEvent.press(await screen.findByRole("button", { name: "Password confirmed" }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(await addButton()).toBeTruthy();
  });

  test("opened from the offer, it asks for the password first", async () => {
    params = { confirm: "1" };
    await renderScreen();
    expect(await screen.findByRole("button", { name: "Password confirmed" })).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  test("a cancel shows nothing", async () => {
    add.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    await renderScreen();
    await fireEvent.press(await addButton());
    await waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a failure says why", async () => {
    add.mockResolvedValue({ error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" } });
    await renderScreen();
    await fireEvent.press(await addButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(/already has a passkey/i);
  });

  test("where the app can't add one, the web can, and the list still works", async () => {
    available = false;
    await renderScreen();
    expect(await screen.findByText(/Pixel/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Open settings on the web" }));

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledExactlyOnceWith("https://omicron.test/settings?tab=account");
  });
});

describe("renaming", () => {
  test("saves the trimmed name and reloads", async () => {
    await renderScreen();
    await startRename();
    await fireEvent.changeText(screen.getByLabelText("Passkey name"), "  Work phone ");
    await fireEvent.press(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith({ id: "a", name: "Work phone" }));
    await waitFor(() => expect(screen.queryByLabelText("Passkey name")).toBeNull());
  });

  test("a blank name can't be saved, and cancelling changes nothing", async () => {
    await renderScreen();
    await startRename();
    await fireEvent.changeText(screen.getByLabelText("Passkey name"), "   ");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Passkey name")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("removing", () => {
  test("asks first, then removes", async () => {
    await renderScreen();
    await pressRemove();
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith({ id: "a" }));
    expect(askConfirm).toHaveBeenCalledOnce();
  });

  test("declining keeps it", async () => {
    askConfirm.mockResolvedValue(false);
    await renderScreen();
    await pressRemove();
    await waitFor(() => expect(askConfirm).toHaveBeenCalledOnce());
    expect(remove).not.toHaveBeenCalled();
  });
});
