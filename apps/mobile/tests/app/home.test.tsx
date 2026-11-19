import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Home from "@/app/(app)/(tabs)/index";
import { pressBack as pressHardwareBack } from "../support/back";

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
vi.mock("@/components/layout/screen", async () => {
  const { View } = await import("react-native");
  return { Screen: ({ children }: { children: ReactNode }) => <View>{children}</View> };
});
vi.mock("@/components/post/post-list", () => ({ PostList: () => null }));
vi.mock("@/components/ui/badge", () => ({ CountBadge: () => null }));
vi.mock("@/components/ui/button", () => ({ IconButton: () => null }));
vi.mock("@/components/ui/swipe-pages", () => ({ SwipePages: () => null }));
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});
vi.mock("@/components/ui/tabs", async () => {
  const { Pressable, Text, View } = await import("react-native");
  return {
    UnderlineTabs: ({
      tabs,
      value,
      onChange,
    }: {
      tabs: { value: string }[];
      value: string;
      onChange: (value: string) => void;
    }) => (
      <View>
        <Text testID="current feed">{value}</Text>
        {tabs.map((tab) => (
          <Pressable key={tab.value} role="button" onPress={() => onChange(tab.value)}>
            <Text>{tab.value}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});
vi.mock("@/lib/auth/session", () => ({ useViewer: () => ({ signedIn }) }));
vi.mock("@/lib/query/notifications", () => ({ useUnreadCount: () => 0 }));
vi.mock("@/lib/query/paged", () => ({ usePagedQuery: () => ({ items: [] }) }));
vi.mock("@/lib/prefs", async (original) => ({
  ...(await original<object>()),
  useDefaultFeed: () => [defaultFeed, () => undefined],
  useFeedLangFilter: () => [null, () => undefined],
}));

const currentFeed = () => screen.getByTestId("current feed");
const choose = (feed: string) => fireEvent.press(screen.getByRole("button", { name: feed }));
const pressBack = async () => {
  let handled = false;
  await act(() => {
    handled = pressHardwareBack();
  });
  return handled;
};

beforeEach(() => {
  focused = true;
  signedIn = true;
  defaultFeed = null;
});

describe("Back on Home", () => {
  test("from another feed returns to For you and stays in the app", async () => {
    await render(<Home />);
    await choose("global");

    expect(await pressBack()).toBe(true);
    expect(currentFeed()).toHaveTextContent("for-you");
  });

  test("a second Back leaves the app", async () => {
    await render(<Home />);
    await choose("local");
    await pressBack();

    expect(await pressBack()).toBe(false);
    expect(currentFeed()).toHaveTextContent("for-you");
  });

  test("on the default feed it leaves the app straight away", async () => {
    await render(<Home />);
    expect(await pressBack()).toBe(false);
  });

  test("returns to the person's own default feed, not always For you", async () => {
    defaultFeed = "local";
    await render(<Home />);
    expect(currentFeed()).toHaveTextContent("local");
    await choose("for-you");

    expect(await pressBack()).toBe(true);
    expect(currentFeed()).toHaveTextContent("local");
    expect(await pressBack()).toBe(false);
  });

  test("a guest returns to their own default, since they have no For you", async () => {
    signedIn = false;
    await render(<Home />);
    expect(currentFeed()).toHaveTextContent("local");
    await choose("global");

    expect(await pressBack()).toBe(true);
    expect(currentFeed()).toHaveTextContent("local");
  });

  test("a screen above Home keeps its own Back, rather than Home switching feed behind it", async () => {
    const { rerender } = await render(<Home />);
    await choose("global");

    focused = false;
    await rerender(<Home key="blurred" />);

    expect(await pressBack()).toBe(false);
  });
});
