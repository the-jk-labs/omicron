// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { HtmlContent } from "@/components/reader/html-content";

vi.mock("expo-clipboard", () => ({ setStringAsync: vi.fn<() => void>() }));
vi.mock("expo-image", () => ({ Image: () => <img alt="" /> }));
vi.mock("expo-router", () => ({ router: { push: vi.fn<() => void>() } }));
vi.mock("expo-web-browser", () => ({ openBrowserAsync: vi.fn<() => void>() }));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: { children: ReactNode }) => <div>{children}</div> },
  FadeIn: { duration: () => undefined },
  useAnimatedStyle: () => ({}),
  withTiming: (value: unknown) => value,
}));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ origin: "https://omicron.test", media: (src: string) => src }),
}));
vi.mock("@/components/ui/button", () => ({ IconButton: () => null }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/text", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/reader/math-view", () => ({ MathView: () => <i>formula</i> }));

const paragraph = (index: number) => `<p>Paragraph ${index} ${"word ".repeat(40)}</p>`;
const post = (count: number) => Array.from({ length: count }, (_, index) => paragraph(index)).join("");
const shown = (index: number) => screen.queryByText(new RegExp(`Paragraph ${index} `)) !== null;

/** Lets the slide-in finish and every later step of the post appear. */
async function settle() {
  // A round per step: `act` holds state updates until it ends, and each step schedules the next from an effect.
  for (let round = 0; round < 40; round++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => setTimeout(callback, 1));
  vi.stubGlobal("cancelIdleCallback", (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
  return () => vi.useRealTimers();
});

describe("HtmlContent", () => {
  test("a long post starts with its first screens, not the whole thing, so the slide-in isn't held up", () => {
    render(<HtmlContent html={post(100)} />);
    expect(shown(0)).toBe(true);
    expect(shown(99)).toBe(false);
  });

  test("the rest follows, in order, until the whole post is there", async () => {
    const onComplete = vi.fn<() => void>();
    render(<HtmlContent html={post(100)} onComplete={onComplete} />);
    expect(onComplete).not.toHaveBeenCalled();

    await settle();

    for (const index of [0, 1, 50, 99]) expect(shown(index)).toBe(true);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  test("nothing more appears until the slide-in has had time to run", async () => {
    render(<HtmlContent html={post(100)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(shown(99)).toBe(false);
  });

  test("a short post shows whole at once, and what's below it still waits for the slide-in", async () => {
    const onComplete = vi.fn<() => void>();
    render(<HtmlContent html={post(2)} onComplete={onComplete} />);
    expect(shown(1)).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    await settle();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  test("a post with nothing in it still completes", async () => {
    const onComplete = vi.fn<() => void>();
    render(<HtmlContent html="" onComplete={onComplete} />);
    await settle();
    expect(onComplete).toHaveBeenCalledOnce();
  });

  test("an edited body starts over with its own content", async () => {
    const { rerender } = render(<HtmlContent html={post(100)} />);
    await settle();
    rerender(<HtmlContent html="<p>Rewritten</p>" />);
    expect(screen.getByText(/Rewritten/)).toBeTruthy();
    expect(shown(0)).toBe(false);
  });

  test("leaving part way stops the work", async () => {
    const onComplete = vi.fn<() => void>();
    const { unmount } = render(<HtmlContent html={post(100)} onComplete={onComplete} />);
    unmount();
    await settle();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
