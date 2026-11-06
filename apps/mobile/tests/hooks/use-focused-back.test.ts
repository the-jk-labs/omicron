// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { useFocusedBack } from "@/hooks/use-focused-back";
// The same module the app gets as `react-native` (vitest.config.mts), imported directly for its `press` helper.
import { BackHandler } from "../support/react-native";

let focused = true;
vi.mock("expo-router", () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    useEffect(() => (focused ? effect() : undefined), [effect]);
  },
}));

const pressBack = () => BackHandler.press();

beforeEach(() => {
  focused = true;
});

describe("useFocusedBack", () => {
  test("while active and focused, Back runs the action and goes no further", () => {
    const action = vi.fn<() => void>();
    const { unmount } = renderHook(() => useFocusedBack(true, action));
    expect(pressBack()).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    unmount();
  });

  test("inactive, it leaves Back alone", () => {
    const action = vi.fn<() => void>();
    renderHook(() => useFocusedBack(false, action));
    expect(pressBack()).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  test("not focused, it leaves Back to the screen above", () => {
    focused = false;
    const action = vi.fn<() => void>();
    renderHook(() => useFocusedBack(true, action));
    expect(pressBack()).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  test("stops once it becomes inactive", () => {
    const action = vi.fn<() => void>();
    const { rerender } = renderHook(({ active }) => useFocusedBack(active, action), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    expect(pressBack()).toBe(false);
  });

  test("stops when the screen goes away", () => {
    const action = vi.fn<() => void>();
    const { unmount } = renderHook(() => useFocusedBack(true, action));
    unmount();
    expect(pressBack()).toBe(false);
  });

  test("a sheet opened afterwards closes first", () => {
    const action = vi.fn<() => void>();
    const dismiss = vi.fn<() => void>();
    const screen = renderHook(() => useFocusedBack(true, action));
    const sheet = renderHook(() => useBackDismiss(true, dismiss));

    expect(pressBack()).toBe(true);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
    sheet.unmount();
    screen.unmount();
  });
});
