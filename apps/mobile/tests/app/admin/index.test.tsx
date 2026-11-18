import type { Me } from "@omicron/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import Admin from "@/app/(app)/admin";
import { makeMe } from "../../fixtures";

let viewer: Me | null = null;
const refetch = vi.fn<() => void>();
const adminReports = vi.fn<() => Promise<unknown>>();

vi.mock("@/lib/auth/session", () => ({ useViewer: () => ({ user: viewer, refetch }) }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ origin: "https://omicron.test" }),
  useApi: () => ({ adminReports }),
}));
vi.mock("@/components/auth/two-factor-setup", async () => {
  const { Text } = await import("react-native");
  return { TwoFactorSetup: ({ staff }: { staff: boolean }) => <Text>{staff ? "staff setup" : "setup"}</Text> };
});
vi.mock("@/components/settings/form-screen", async () => {
  const { View } = await import("react-native");
  return { FormScreen: ({ children }: { children: ReactNode }) => <View>{children}</View> };
});
vi.mock("@/components/layout/screen", async () => {
  const { View } = await import("react-native");
  return {
    Screen: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    ScreenHeader: () => null,
  };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

async function renderAdmin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={client}>
      <Admin />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  adminReports.mockResolvedValue({ reports: [], openCount: 0 });
});

test("a moderator without the two-factor the instance requires sees only its setup, and nothing is loaded", async () => {
  viewer = makeMe({ isModerator: true, twoFactorRequired: true, twoFactorEnabled: false });
  await renderAdmin();
  expect(screen.getByText("Set up two-factor authentication")).toBeOnTheScreen();
  expect(screen.getByText("staff setup")).toBeOnTheScreen();
  expect(adminReports).not.toHaveBeenCalled();
});

test("with it on, the moderation tools load", async () => {
  viewer = makeMe({ isAdmin: true, twoFactorRequired: true, twoFactorEnabled: true });
  await renderAdmin();
  expect(screen.queryByText("Set up two-factor authentication")).toBeNull();
  expect(adminReports).toHaveBeenCalled();
});
