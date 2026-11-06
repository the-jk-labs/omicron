// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { ReaderHeader } from "@/components/reader/reader-header";
import { makePost } from "../../fixtures";

vi.mock("expo-image", () => ({
  Image: ({ source }: { source: string }) => <img alt="" src={source} data-testid="banner" />,
}));
vi.mock("expo-router", () => ({ Link: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn<() => void>() }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ media: (src: string | null) => src ?? undefined }),
}));
vi.mock("@/components/post/post-bits", () => ({ AiAssistedBadge: () => null, UserAvatar: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/pressable", () => ({
  PressableScale: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

const IMAGE = "https://cdn.test/opening.jpg";

describe("ReaderHeader", () => {
  test("a banner taken from the body isn't drawn again above that body", () => {
    render(<ReaderHeader post={makePost({ coverUrl: null, bannerUrl: IMAGE, contentHtml: `<img src="${IMAGE}">` })} />);
    expect(screen.queryByTestId("banner")).toBeNull();
  });

  test("a cover the author chose shows above the article", () => {
    render(<ReaderHeader post={makePost({ coverUrl: IMAGE, bannerUrl: IMAGE })} />);
    expect(screen.getByTestId("banner").getAttribute("src")).toBe(IMAGE);
  });

  test("a post with no image shows no banner", () => {
    render(<ReaderHeader post={makePost()} />);
    expect(screen.queryByTestId("banner")).toBeNull();
  });
});
