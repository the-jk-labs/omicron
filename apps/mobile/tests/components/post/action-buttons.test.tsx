// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LikeButton, RecommendButton } from "@/components/post/action-buttons";
import { makePost } from "../../fixtures";

// Each pop is one withSequence (grow, then settle back); its steps name the animation each one used.
const pop = vi.fn<(...steps: unknown[]) => number>(() => 1);
const mutate = vi.fn<(input: { id: string; on: boolean }) => void>();

vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: { children?: ReactNode }) => createElement("div", null, children) },
  createAnimatedComponent: (component: unknown) => component,
  useSharedValue: (value: number) => ({ get: () => value, set: vi.fn<(next: number) => void>() }),
  useAnimatedStyle: () => ({}),
  withSequence: (...steps: unknown[]) => pop(...steps),
  withSpring: () => "spring",
  withTiming: () => "timing",
}));
vi.mock("react-native-svg", () => ({ default: () => null, Path: () => null }));
vi.mock("@/hooks/use-theme-colors", () => ({ useThemeColors: (names: string[]) => names }));
vi.mock("@/components/instance-provider", () => ({ useInstance: () => ({ origin: "https://omicron.test" }) }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/lib/query/engagement", () => ({
  useRequireSignIn: () => (action: () => void) => action(),
  useToggleLike: () => ({ mutate }),
  useToggleRecommend: () => ({ mutate }),
}));

beforeEach(() => {
  pop.mockClear();
});

describe("reaction buttons", () => {
  test("a post that is already liked doesn't pop when its row mounts or re-renders", () => {
    const { rerender } = render(<LikeButton post={makePost({ liked: true })} />);
    // The optimistic update, the server's answer and a cache refresh each re-render it.
    rerender(<LikeButton post={makePost({ liked: false })} />);
    rerender(<LikeButton post={makePost({ liked: true })} />);
    rerender(<LikeButton post={makePost({ liked: true, likeCount: 4 })} />);
    expect(pop).not.toHaveBeenCalled();
  });

  test("liking pops once, however the cache settles afterwards", () => {
    const { rerender } = render(<LikeButton post={makePost({ liked: false })} />);
    fireEvent.click(screen.getByRole("button"));
    rerender(<LikeButton post={makePost({ liked: true })} />);
    rerender(<LikeButton post={makePost({ liked: false })} />);
    rerender(<LikeButton post={makePost({ liked: true })} />);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: makePost().id, on: true });
  });

  // Bug: the heart sprang back past its size and wobbled, so one tap read as three or four pops.
  test("the pop settles without a spring, so it reads as one", () => {
    render(<LikeButton post={makePost({ liked: false })} />);
    fireEvent.click(screen.getByRole("button"));
    expect(pop).toHaveBeenCalledWith("timing", "timing");
  });

  test("unliking doesn't pop", () => {
    render(<LikeButton post={makePost({ liked: true })} />);
    fireEvent.click(screen.getByRole("button"));
    expect(pop).not.toHaveBeenCalled();
  });

  test("reposting pops once too", () => {
    const { rerender } = render(<RecommendButton post={makePost({ recommended: false })} />);
    fireEvent.click(screen.getByRole("button"));
    rerender(<RecommendButton post={makePost({ recommended: true })} />);
    rerender(<RecommendButton post={makePost({ recommended: false })} />);
    rerender(<RecommendButton post={makePost({ recommended: true })} />);
    expect(pop).toHaveBeenCalledTimes(1);
  });
});
