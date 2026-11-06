// @vitest-environment happy-dom
// oxlint-disable typescript/no-unsafe-type-assertion -- deliberately partial notifications
import type { Notification } from "@omicron/contract";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import Notifications from "@/app/(app)/notifications";

let items: Partial<Notification>[] = [];

vi.mock("expo-router", () => ({
  router: { push: vi.fn<() => void>() },
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@legendapp/list/react-native", () => ({
  LegendList: ({
    data,
    renderItem,
  }: {
    data: { id: string }[];
    renderItem: (info: { item: unknown }) => ReactNode;
  }) => (
    <div>
      {data.map((item) => (
        <div key={item.id}>{renderItem({ item })}</div>
      ))}
    </div>
  ),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("react-native-svg", () => ({
  default: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
  Path: ({ fill }: { fill: string }) => <path data-testid="filled-shape" data-fill={fill} />,
}));
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
vi.mock("@/components/layout/screen", () => ({
  Screen: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  ScreenHeader: () => null,
}));
vi.mock("@/components/post/post-bits", () => ({ UserAvatar: () => <img alt="" /> }));
vi.mock("@/components/ui/icon", () => ({ Icon: ({ name }: { name: string }) => <i data-testid={`icon-${name}`} /> }));
vi.mock("@/components/ui/pull-to-refresh", () => ({ PullToRefresh: () => null }));
vi.mock("@/components/ui/states", () => ({
  EmptyState: () => null,
  ErrorState: () => null,
  ListFooter: () => null,
  LoadingState: () => null,
}));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/pressable", () => ({
  PressableScale: ({
    children,
    className,
    accessibilityLabel,
  }: {
    children: ReactNode;
    className?: string;
    accessibilityLabel?: string;
  }) => (
    <div className={className} aria-label={accessibilityLabel}>
      {children}
    </div>
  ),
}));

const notification = (type: Notification["type"]): Partial<Notification> => ({
  id: type,
  type,
  read: true,
  createdAt: "2026-11-01T00:00:00Z",
  actor: { username: "ada", displayName: "Ada", avatarUrl: null } as Notification["actor"],
  postTitle: "A post title",
  commentSnippet: "A comment that makes the row taller than its avatar",
});

function renderPage(...types: Notification["type"][]) {
  items = types.map(notification);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Notifications />
    </QueryClientProvider>,
  );
}

describe("the avatar's badge", () => {
  test("stays on the avatar in a row taller than it, rather than dropping to the row's bottom", () => {
    renderPage("comment");
    // A row's children stretch to its height, and the badge is pinned to the bottom of its parent.
    expect(screen.getByLabelText("Ada").className).toContain("self-start");
  });

  test.each(["like", "comment_like"] as const)("a %s shows a filled heart", (type) => {
    renderPage(type);
    expect(screen.getByTestId("filled-shape").dataset.fill).toBe("#e5484d");
    expect(screen.queryByTestId("icon-heart")).toBeNull();
  });

  test("other kinds keep their outline icons", () => {
    renderPage("comment");
    expect(screen.getByTestId("icon-message-circle")).toBeTruthy();
    expect(screen.queryByTestId("filled-shape")).toBeNull();
  });
});
