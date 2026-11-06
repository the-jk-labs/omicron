// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import AccountSettings from "@/app/(app)/settings/account";

type AuthResult = { data?: unknown; error?: { code?: string; message?: string } | null };

const push = vi.fn<(href: unknown) => void>();
const listSessions = vi.fn<() => Promise<AuthResult>>();
const getSession = vi.fn<() => Promise<AuthResult>>();

vi.mock("expo-router", () => ({ router: { push: (href: unknown) => push(href) } }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn<() => void>() }));
vi.mock("@/hooks/use-refresh-on-focus", () => ({ useRefreshOnFocus: () => undefined }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ origin: "https://omicron.test", auth: { listSessions, getSession } }),
}));
vi.mock("@/lib/auth/session", () => ({
  useViewer: () => ({
    user: { username: "ada", email: "ada@omicron.test", emailVerified: true, createdAt: "2026-01-01T00:00:00Z" },
  }),
}));
vi.mock("@/components/settings/form-screen", () => ({
  FormScreen: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/settings/settings-row", () => ({
  SettingsSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  SettingsRow: ({ label, detail, onPress }: { label: string; detail?: string; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {label} {detail}
    </button>
  ),
}));
vi.mock("@/components/ui/badge", () => ({ Badge: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <progress /> }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountSettings />
    </QueryClientProvider>,
  );
}

const session = (token: string, userAgent: string) => ({
  id: token,
  token,
  userAgent,
  createdAt: "2026-11-01T00:00:00Z",
});

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { token: "here" } } });
});

describe("signed-in devices", () => {
  test("a sign-in older than a day asks for the password instead of an empty card", async () => {
    listSessions.mockResolvedValue({ error: { code: "SESSION_NOT_FRESH", message: "Session is not fresh" } });
    renderScreen();

    fireEvent.click(await screen.findByRole("button", { name: /confirm it's you/i }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/settings/confirm-password");
  });

  test("any other failure says so instead of an empty card", async () => {
    listSessions.mockResolvedValue({ error: { code: "INTERNAL", message: "Database is down" } });
    renderScreen();

    expect(await screen.findByText(/database is down/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /confirm it's you/i })).toBeNull();
  });

  test("a fresh sign-in lists the devices", async () => {
    listSessions.mockResolvedValue({
      data: [session("here", "Omicron/0.1.0 (Android 16)"), session("there", "Mozilla/5.0 (Windows NT 10.0) Chrome/1")],
    });
    renderScreen();

    expect(await screen.findByRole("button", { name: /this device/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /chrome on windows/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /confirm it's you/i })).toBeNull();
  });
});
