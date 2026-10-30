// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
// The same module the app gets as `react-native` (vitest.config.mts), imported directly for its `press` helper.
import { BackHandler } from "../support/react-native";

const pressBack = () => BackHandler.press();

describe("useBackDismiss", () => {
  // Bug: Back with a sheet open went past it, closing the screen behind or the whole app.
  test("Back closes an open sheet and goes no further", () => {
    const dismiss = vi.fn<() => void>();
    renderHook(() => useBackDismiss(true, dismiss));

    expect(pressBack()).toBe(true);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  test("a closed sheet leaves Back to the screen", () => {
    const dismiss = vi.fn<() => void>();
    const { rerender, unmount } = renderHook(({ open }) => useBackDismiss(open, dismiss), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    expect(pressBack()).toBe(false);
    unmount();
    expect(dismiss).not.toHaveBeenCalled();
  });

  test("the sheet opened last closes first", () => {
    const below = vi.fn<() => void>();
    const above = vi.fn<() => void>();
    renderHook(() => useBackDismiss(true, below));
    renderHook(() => useBackDismiss(true, above));

    pressBack();
    expect(above).toHaveBeenCalledOnce();
    expect(below).not.toHaveBeenCalled();
  });
});
