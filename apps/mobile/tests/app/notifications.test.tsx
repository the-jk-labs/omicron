// oxlint-disable typescript/no-unsafe-type-assertion -- deliberately partial notifications
import type { Notification } from "@omicron/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import Notifications from "@/app/(app)/notifications";

let items: Partial<Notification>[] = [];

vi.mock("expo-router", () => ({
  router: { push: vi.fn<() => void>() },
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@legendapp/list/react-native", async () => {
  const { View } = await import("react-native");
  return {
    LegendList: ({
      data,
      renderItem,
    }: {
      data: { id: string }[];
      renderItem: (info: { item: unknown }) => ReactNode;
    }) => (
      <View>
        {data.map((item) => (
          <View key={item.id}>{renderItem({ item })}</View>
        ))}
      </View>
    ),
  };
});
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("react-native-svg", async () => {
  const { View } = await import("react-native");
  return {
    default: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    Path: ({ fill }: { fill: string }) => <View testID="filled-shape" accessibilityHint={fill} />,
  };
});
vi.mock("@/components/instance-provider", () => ({
  useApi: () => ({
    notifications: () => Promise.resolve({ items: [], nextCursor: null }),
    markAllNotificationsRead: () => Promise.resolve(),
  }),
}));
vi.mock("@/lib/query/paged", () => ({
  usePagedQuery: () => ({ items, isPending: false, error: null, loadMore: () => undefined }),
}));
vi.mock("@/hooks/use-theme-colors", () => ({ useThemeColor: () => "#e5484d" }));
vi.mock("@/components/layout/screen", async () => {
  const { View } = await import("react-native");
  return { Screen: ({ children }: { children: ReactNode }) => <View>{children}</View>, ScreenHeader: () => null };
});
vi.mock("@/components/post/post-bits", async () => ({ UserAvatar: (await import("react-native")).View }));
vi.mock("@/components/ui/icon", async () => {
  const { View } = await import("react-native");
  return { Icon: ({ name }: { name: string }) => <View testID={`icon-${name}`} /> };
});
vi.mock("@/components/ui/pull-to-refresh", () => ({ PullToRefresh: () => null }));
vi.mock("@/components/ui/states", () => ({
  EmptyState: () => null,
  ErrorState: () => null,
  ListFooter: () => null,
  LoadingState: () => null,
}));
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});
vi.mock("@/components/ui/pressable", async () => {
  const { View } = await import("react-native");
  return {
    PressableScale: ({
      children,
      className,
      accessibilityLabel,
    }: {
      children: ReactNode;
      className?: string;
      accessibilityLabel?: string;
    }) => (
      <View className={className} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    ),
  };
});

const notification = (type: Notification["type"]): Partial<Notification> => ({
  id: type,
  type,
  read: true,
  createdAt: "2026-11-01T00:00:00Z",
  actor: { username: "ada", displayName: "Ada", avatarUrl: null } as Notification["actor"],
  postTitle: "A post title",
  commentSnippet: "A comment that makes the row taller than its avatar",
});

async function renderPage(...types: Notification["type"][]) {
  items = types.map(notification);
  return await render(
    <QueryClientProvider client={new QueryClient()}>
      <Notifications />
    </QueryClientProvider>,
  );
}

describe("the avatar's badge", () => {
  test("stays on the avatar in a row taller than it, rather than dropping to the row's bottom", async () => {
    await renderPage("comment");
    // A row's children stretch to its height, and the badge is pinned to the bottom of its parent.
    expect(screen.getByLabelText("Ada")).toHaveProp("className", expect.stringContaining("self-start"));
  });

  test.each(["like", "comment_like"] as const)("a %s shows a filled heart", async (type) => {
    await renderPage(type);
    expect(screen.getByTestId("filled-shape")).toHaveProp("accessibilityHint", "#e5484d");
    expect(screen.queryByTestId("icon-heart")).toBeNull();
  });

  test("other kinds keep their outline icons", async () => {
    await renderPage("comment");
    expect(screen.getByTestId("icon-message-circle")).toBeTruthy();
    expect(screen.queryByTestId("filled-shape")).toBeNull();
  });
});
