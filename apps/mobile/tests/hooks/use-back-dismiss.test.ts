import { renderHook } from "@testing-library/react-native";
import { describe, expect, test, vi } from "vitest";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { pressBack } from "../support/back";

describe("useBackDismiss", () => {
  // Bug: Back with a sheet open went past it, closing the screen behind or the whole app.
  test("Back closes an open sheet and goes no further", async () => {
    const dismiss = vi.fn<() => void>();
    await renderHook(() => useBackDismiss(true, dismiss));

    expect(pressBack()).toBe(true);
    expect(dismiss).toHaveBeenCalledOnce();
  });

  test("a closed sheet leaves Back to the screen", async () => {
    const dismiss = vi.fn<() => void>();
    const { rerender, unmount } = await renderHook(({ open }: { open: boolean }) => useBackDismiss(open, dismiss), {
      initialProps: { open: true },
    });

    await rerender({ open: false });
    expect(pressBack()).toBe(false);
    await unmount();
    expect(dismiss).not.toHaveBeenCalled();
  });

  test("the sheet opened last closes first", async () => {
    const below = vi.fn<() => void>();
    const above = vi.fn<() => void>();
    await renderHook(() => useBackDismiss(true, below));
    await renderHook(() => useBackDismiss(true, above));

    pressBack();
    expect(above).toHaveBeenCalledOnce();
    expect(below).not.toHaveBeenCalled();
  });
});
