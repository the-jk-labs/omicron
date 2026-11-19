import { renderHook } from "@testing-library/react-native";
import { useEffect } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { useFocusedBack } from "@/hooks/use-focused-back";
import { pressBack } from "../support/back";

let focused = true;
vi.mock("expo-router", () => ({
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    useEffect(() => (focused ? effect() : undefined), [effect]);
  },
}));

beforeEach(() => {
  focused = true;
});

describe("useFocusedBack", () => {
  test("while active and focused, Back runs the action and goes no further", async () => {
    const action = vi.fn<() => void>();
    const { unmount } = await renderHook(() => useFocusedBack(true, action));
    expect(pressBack()).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    await unmount();
  });

  test("inactive, it leaves Back alone", async () => {
    const action = vi.fn<() => void>();
    await renderHook(() => useFocusedBack(false, action));
    expect(pressBack()).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  test("not focused, it leaves Back to the screen above", async () => {
    focused = false;
    const action = vi.fn<() => void>();
    await renderHook(() => useFocusedBack(true, action));
    expect(pressBack()).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  test("stops once it becomes inactive", async () => {
    const action = vi.fn<() => void>();
    const { rerender } = await renderHook(({ active }: { active: boolean }) => useFocusedBack(active, action), {
      initialProps: { active: true },
    });
    await rerender({ active: false });
    expect(pressBack()).toBe(false);
  });

  test("stops when the screen goes away", async () => {
    const action = vi.fn<() => void>();
    const { unmount } = await renderHook(() => useFocusedBack(true, action));
    await unmount();
    expect(pressBack()).toBe(false);
  });

  test("a sheet opened afterwards closes first", async () => {
    const action = vi.fn<() => void>();
    const dismiss = vi.fn<() => void>();
    const screen = await renderHook(() => useFocusedBack(true, action));
    const sheet = await renderHook(() => useBackDismiss(true, dismiss));

    expect(pressBack()).toBe(true);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
    await sheet.unmount();
    await screen.unmount();
  });
});
