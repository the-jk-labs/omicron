import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { ReaderHeader } from "@/components/reader/reader-header";
import { makePost } from "../../fixtures";

vi.mock("expo-image", async () => {
  const { Text } = await import("react-native");
  return { Image: ({ source }: { source: string }) => <Text testID="banner">{source}</Text> };
});
vi.mock("expo-router", async () => {
  const { View } = await import("react-native");
  return { Link: ({ children }: { children: ReactNode }) => <View>{children}</View> };
});
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn<() => void>() }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ media: (src: string | null) => src ?? undefined }),
}));
vi.mock("@/components/post/post-bits", () => ({ AiAssistedBadge: () => null, UserAvatar: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/pressable", async () => {
  const { View } = await import("react-native");
  return { PressableScale: ({ children }: { children: ReactNode }) => <View>{children}</View> };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: ({ children }: { children: ReactNode }) => <Text>{children}</Text> };
});

const IMAGE = "https://cdn.test/opening.jpg";

describe("ReaderHeader", () => {
  test("a banner taken from the body isn't drawn again above that body", async () => {
    await render(
      <ReaderHeader post={makePost({ coverUrl: null, bannerUrl: IMAGE, contentHtml: `<img src="${IMAGE}">` })} />,
    );
    expect(screen.queryByTestId("banner")).toBeNull();
  });

  test("a cover the author chose shows above the article", async () => {
    await render(<ReaderHeader post={makePost({ coverUrl: IMAGE, bannerUrl: IMAGE })} />);
    expect(screen.getByTestId("banner")).toHaveTextContent(IMAGE);
  });

  test("a post with no image shows no banner", async () => {
    await render(<ReaderHeader post={makePost()} />);
    expect(screen.queryByTestId("banner")).toBeNull();
  });
});
