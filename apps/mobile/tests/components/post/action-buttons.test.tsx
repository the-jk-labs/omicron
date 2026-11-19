import { fireEvent, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { LikeButton, RecommendButton } from "@/components/post/action-buttons";
import { makePost } from "../../fixtures";

// Each pop is one withSequence (grow, then settle back); its steps name the animation each one used.
const pop = vi.fn<(...steps: unknown[]) => number>(() => 1);
const mutate = vi.fn<(input: { id: string; on: boolean }) => void>();

vi.mock("react-native-reanimated", async () => ({
  default: { View: (await import("react-native")).View },
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
  test("a post that is already liked doesn't pop when its row mounts or re-renders", async () => {
    const { rerender } = await render(<LikeButton post={makePost({ liked: true })} />);
    // The optimistic update, the server's answer and a cache refresh each re-render it.
    await rerender(<LikeButton post={makePost({ liked: false })} />);
    await rerender(<LikeButton post={makePost({ liked: true })} />);
    await rerender(<LikeButton post={makePost({ liked: true, likeCount: 4 })} />);
    expect(pop).not.toHaveBeenCalled();
  });

  test("liking pops once, however the cache settles afterwards", async () => {
    const { rerender } = await render(<LikeButton post={makePost({ liked: false })} />);
    await fireEvent.press(screen.getByRole("button"));
    await rerender(<LikeButton post={makePost({ liked: true })} />);
    await rerender(<LikeButton post={makePost({ liked: false })} />);
    await rerender(<LikeButton post={makePost({ liked: true })} />);
    expect(pop).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ id: makePost().id, on: true });
  });

  // Bug: the heart sprang back past its size and wobbled, so one tap read as three or four pops.
  test("the pop settles without a spring, so it reads as one", async () => {
    await render(<LikeButton post={makePost({ liked: false })} />);
    await fireEvent.press(screen.getByRole("button"));
    expect(pop).toHaveBeenCalledWith("timing", "timing");
  });

  test("unliking doesn't pop", async () => {
    await render(<LikeButton post={makePost({ liked: true })} />);
    await fireEvent.press(screen.getByRole("button"));
    expect(pop).not.toHaveBeenCalled();
  });

  test("reposting pops once too", async () => {
    const { rerender } = await render(<RecommendButton post={makePost({ recommended: false })} />);
    await fireEvent.press(screen.getByRole("button"));
    await rerender(<RecommendButton post={makePost({ recommended: true })} />);
    await rerender(<RecommendButton post={makePost({ recommended: false })} />);
    await rerender(<RecommendButton post={makePost({ recommended: true })} />);
    expect(pop).toHaveBeenCalledTimes(1);
  });
});
