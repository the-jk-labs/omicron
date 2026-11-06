// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Home from "@/app/(app)/(tabs)/index";
// The same module the app gets as `react-native` (vitest.config.mts), imported directly for its `press` helper.
import { BackHandler } from "../support/react-native";

let focused = true;
let signedIn = true;
let defaultFeed: string | null = null;

vi.mock("@/components/layout/instance-logo", () => ({ InstanceLogo: () => null }));
vi.mock("expo-router", () => ({
  router: { push: vi.fn<() => void>() },
  // Runs only while the screen is focused, and cleans up when it isn't, as the real one does.
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    useEffect(() => (focused ? effect() : undefined), [effect]);
  },
}));
vi.mock("react-native-reanimated", () => ({ useSharedValue: (value: number) => ({ value }) }));
vi.mock("@/components/auth/passkey-prompt", () => ({ PasskeyPrompt: () => null }));
vi.mock("@/components/instance-provider", () => ({ useApi: () => ({}), useInstance: () => ({ name: "Omicron" }) }));
vi.mock("@/components/layout/screen", () => ({
  Screen: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/post/post-list", () => ({ PostList: () => null }));
vi.mock("@/components/ui/badge", () => ({ CountBadge: () => null }));
vi.mock("@/components/ui/button", () => ({ IconButton: () => null }));
vi.mock("@/components/ui/swipe-pages", () => ({ SwipePages: () => null }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/tabs", () => ({
  UnderlineTabs: ({
    tabs,
    value,
    onChange,
  }: {
    tabs: { value: string }[];
    value: string;
    onChange: (value: string) => void;
  }) => (
    <div>
      <output aria-label="current feed">{value}</output>
      {tabs.map((tab) => (
        <button key={tab.value} type="button" onClick={() => onChange(tab.value)}>
          {tab.value}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@/lib/auth/session", () => ({ useViewer: () => ({ signedIn }) }));
vi.mock("@/lib/query/notifications", () => ({ useUnreadCount: () => 0 }));
vi.mock("@/lib/query/paged", () => ({ usePagedQuery: () => ({ items: [] }) }));
vi.mock("@/lib/prefs", async (original) => ({
  ...(await original<object>()),
  useDefaultFeed: () => [defaultFeed, () => undefined],
  useFeedLangFilter: () => [null, () => undefined],
}));

const currentFeed = () => screen.getByLabelText("current feed").textContent;
const choose = (feed: string) => fireEvent.click(screen.getByRole("button", { name: feed }));
const pressBack = () => {
  let handled = false;
  act(() => {
    handled = BackHandler.press();
  });
  return handled;
};

beforeEach(() => {
  focused = true;
  signedIn = true;
  defaultFeed = null;
});

describe("Back on Home", () => {
  test("from another feed returns to For you and stays in the app", () => {
    render(<Home />);
    choose("global");

    expect(pressBack()).toBe(true);
    expect(currentFeed()).toBe("for-you");
  });

  test("a second Back leaves the app", () => {
    render(<Home />);
    choose("local");
    pressBack();

    expect(pressBack()).toBe(false);
    expect(currentFeed()).toBe("for-you");
  });

  test("on the default feed it leaves the app straight away", () => {
    render(<Home />);
    expect(pressBack()).toBe(false);
  });

  test("returns to the person's own default feed, not always For you", () => {
    defaultFeed = "local";
    render(<Home />);
    expect(currentFeed()).toBe("local");
    choose("for-you");

    expect(pressBack()).toBe(true);
    expect(currentFeed()).toBe("local");
    expect(pressBack()).toBe(false);
  });

  test("a guest returns to their own default, since they have no For you", () => {
    signedIn = false;
    render(<Home />);
    expect(currentFeed()).toBe("local");
    choose("global");

    expect(pressBack()).toBe(true);
    expect(currentFeed()).toBe("local");
  });

  test("a screen above Home keeps its own Back, rather than Home switching feed behind it", () => {
    const { rerender } = render(<Home />);
    choose("global");

    focused = false;
    rerender(<Home key="blurred" />);

    expect(pressBack()).toBe(false);
  });
});
