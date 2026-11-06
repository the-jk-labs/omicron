// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/components/auth/auth-shell", () => ({
  FormError: ({ message }: { message: string | null }) => (message ? <p role="alert">{message}</p> : null),
}));
vi.mock("@/components/settings/form-screen", () => ({
  FormScreen: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));
vi.mock("@/components/settings/confirm-password-form", () => ({
  ConfirmPasswordForm: ({ onConfirmed }: { onConfirmed: () => void }) => (
    <button type="button" onClick={onConfirmed}>
      Password confirmed
    </button>
  ),
}));
vi.mock("@/components/settings/settings-row", () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SettingsRow: ({ label, detail, trailing }: { label: string; detail?: string; trailing?: ReactNode }) => (
    <div>
      {label} {detail}
      {trailing}
    </div>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, disabled }: { children: ReactNode; onPress?: () => void; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
  IconButton: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button type="button" aria-label={label} onClick={onPress} />
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: ({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) => (
    <input aria-label="Passkey name" value={value} onChange={(event) => onChangeText(event.target.value)} />
  ),
}));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <progress /> }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const pixel = { id: "a", name: "Pixel", backedUp: true, createdAt: "2026-11-01T00:00:00Z" };
const addButton = () => screen.findByRole("button", { name: "Add a passkey" });

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
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

const startRename = async () => fireEvent.click(await screen.findByRole("button", { name: "Rename Pixel" }));

const pressRemove = async () => fireEvent.click(await screen.findByRole("button", { name: "Remove Pixel" }));

describe("the list", () => {
  test("shows each passkey as the web does", async () => {
    renderScreen();
    expect(await screen.findByText(/Pixel Synced · Added/)).toBeTruthy();
  });

  test("says when there are none", async () => {
    list.mockResolvedValue({ data: [] });
    renderScreen();
    expect(await screen.findByText("No passkeys yet.")).toBeTruthy();
  });

  test("says when it can't load rather than looking empty", async () => {
    list.mockResolvedValue({ error: { message: "Database is down" } });
    renderScreen();
    expect(await screen.findByText(/database is down/i)).toBeTruthy();
  });
});

describe("adding", () => {
  test("reloads the list once added", async () => {
    renderScreen();
    fireEvent.click(await addButton());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(add).toHaveBeenCalledOnce();
  });

  test("an old sign-in asks for the password, then carries on adding", async () => {
    add.mockResolvedValueOnce({ error: { code: "SESSION_NOT_FRESH" } });
    renderScreen();
    fireEvent.click(await addButton());

    fireEvent.click(await screen.findByRole("button", { name: "Password confirmed" }));

    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    expect(await addButton()).toBeTruthy();
  });

  test("opened from the offer, it asks for the password first", async () => {
    params = { confirm: "1" };
    renderScreen();
    expect(await screen.findByRole("button", { name: "Password confirmed" })).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  test("a cancel shows nothing", async () => {
    add.mockResolvedValue({ error: { code: "ERROR_CEREMONY_ABORTED" } });
    renderScreen();
    fireEvent.click(await addButton());
    await waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a failure says why", async () => {
    add.mockResolvedValue({ error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" } });
    renderScreen();
    fireEvent.click(await addButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(/already has a passkey/i);
  });

  test("where the app can't add one, the web can, and the list still works", async () => {
    available = false;
    renderScreen();
    expect(await screen.findByText(/Pixel/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a passkey" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open settings on the web" }));

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledExactlyOnceWith("https://omicron.test/settings?tab=account");
  });
});

describe("renaming", () => {
  test("saves the trimmed name and reloads", async () => {
    renderScreen();
    await startRename();
    fireEvent.change(screen.getByRole("textbox", { name: "Passkey name" }), { target: { value: "  Work phone " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith({ id: "a", name: "Work phone" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  test("a blank name can't be saved, and cancelling changes nothing", async () => {
    renderScreen();
    await startRename();
    fireEvent.change(screen.getByRole("textbox", { name: "Passkey name" }), { target: { value: "   " } });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("removing", () => {
  test("asks first, then removes", async () => {
    renderScreen();
    await pressRemove();
    await waitFor(() => expect(remove).toHaveBeenCalledExactlyOnceWith({ id: "a" }));
    expect(askConfirm).toHaveBeenCalledOnce();
  });

  test("declining keeps it", async () => {
    askConfirm.mockResolvedValue(false);
    renderScreen();
    await pressRemove();
    await waitFor(() => expect(askConfirm).toHaveBeenCalledOnce());
    expect(remove).not.toHaveBeenCalled();
  });
});
