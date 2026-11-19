// oxlint-disable typescript/no-unsafe-type-assertion -- deliberately partial stand-ins for the pager and shared value
import { act, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { useImperativeHandle, type ReactNode, type Ref } from "react";
import { Text } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SwipePages } from "@/components/ui/swipe-pages";

const setPage = vi.fn<(page: number) => void>();
let onPageSelected: (event: { nativeEvent: { position: number } }) => void;
let initialPage: number | undefined;
let offscreenLimit: number | undefined;
let scrollWorklet: (event: { eventName: string; position: number; offset: number }) => void;

vi.mock("react-native-pager-view", () => ({ default: () => null }));
vi.mock("react-native-reanimated", async () => {
  const { View } = await import("react-native");
  return {
    useHandler: () => ({ doDependenciesDiffer: false }),
    useEvent: (worklet: typeof scrollWorklet) => {
      scrollWorklet = worklet;
      return worklet;
    },
    createAnimatedComponent: () =>
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- vi.mock factories run before module scope
      function Pager({
        children,
        ref,
        ...props
      }: {
        children: ReactNode;
        ref: Ref<unknown>;
        onPageSelected: typeof onPageSelected;
        initialPage: number;
        offscreenPageLimit: number;
      }) {
        useImperativeHandle(ref, () => ({ setPage: (page: number) => setPage(page) }));
        onPageSelected = props.onPageSelected;
        initialPage = props.initialPage;
        offscreenLimit = props.offscreenPageLimit;
        return <View>{children}</View>;
      },
  };
});

const PAGES = ["for-you", "local", "global"] as const;
type Page = (typeof PAGES)[number];
const renderPage = (page: Page) => <Text>{`page ${page}`}</Text>;
const shown = (page: Page) => screen.queryByText(`page ${page}`) !== null;
const settleOn = async (position: number) => act(() => onPageSelected({ nativeEvent: { position } }));

const idle: (() => void)[] = [];
const runIdle = () =>
  act(() => {
    while (idle.length) idle.shift()!();
  });

function fakeProgress() {
  let current = -1;
  return { get: () => current, set: (next: number) => void (current = next) } as unknown as SharedValue<number>;
}

async function setup(value: Page = "for-you", onChange = vi.fn<(page: Page) => void>(), progress = fakeProgress()) {
  const tree = (next: Page) => (
    <SwipePages pages={PAGES} value={next} onChange={onChange} renderPage={renderPage} progress={progress} />
  );
  const view = await render(tree(value));
  return { onChange, progress, show: (next: Page) => view.rerender(tree(next)) };
}

beforeEach(() => {
  idle.length = 0;
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => idle.push(callback));
  vi.stubGlobal("cancelIdleCallback", () => undefined);
});

describe("SwipePages", () => {
  test("opening shows only the current page, so Home doesn't wait for the others", async () => {
    await setup();
    expect(shown("for-you")).toBe(true);
    expect(shown("local")).toBe(false);
    expect(shown("global")).toBe(false);
  });

  test("the page beside it mounts in idle time, so a swipe never lands on a blank screen", async () => {
    await setup();
    await runIdle();
    expect(shown("local")).toBe(true);
    expect(shown("global")).toBe(false);
  });

  test("starts on the current page, with the marker already there", async () => {
    const { progress } = await setup("global");
    expect(initialPage).toBe(2);
    expect(progress.get()).toBe(2);
    expect(shown("global")).toBe(true);
    expect(setPage).not.toHaveBeenCalled();
  });

  test("keeps every page alive in the native pager", async () => {
    await setup();
    expect(offscreenLimit).toBe(3);
  });

  test("the marker follows every step of a drag, not just where it ends", async () => {
    const { progress } = await setup();
    scrollWorklet({ eventName: "123onPageScroll", position: 0, offset: 0.25 });
    expect(progress.get()).toBe(0.25);
    scrollWorklet({ eventName: "123onPageScroll", position: 1, offset: 0.5 });
    expect(progress.get()).toBe(1.5);
  });

  test("ignores other events from the pager", async () => {
    const { progress } = await setup();
    scrollWorklet({ eventName: "123onPageSelected", position: 2, offset: 0 });
    expect(progress.get()).toBe(0);
  });

  test("a swipe reports the page it settled on, with a tick, without moving the pager again", async () => {
    const { onChange, show } = await setup();
    await settleOn(1);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("local");
    expect(Haptics.selectionAsync).toHaveBeenCalledOnce();
    await show("local");
    expect(setPage).not.toHaveBeenCalled();
  });

  test("a swipe that settles back on the same page changes nothing", async () => {
    const { onChange } = await setup();
    await settleOn(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  test("tapping a tab moves the pager there, and its own settling reports nothing new", async () => {
    const { onChange, show } = await setup();
    await show("global");
    expect(setPage).toHaveBeenCalledExactlyOnceWith(2);
    expect(shown("global")).toBe(true);
    await settleOn(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a visited page stays mounted, so it keeps its scroll position", async () => {
    const { show } = await setup();
    await runIdle();
    await show("global");
    await runIdle();
    await show("for-you");
    await runIdle();
    for (const page of PAGES) expect(shown(page)).toBe(true);
  });
});
