// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { router } from "expo-router";
import { Platform } from "react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useComposerMounted, useComposerPreload } from "@/lib/editor/composer-preload";

vi.mock("expo-router", () => ({ router: { prefetch: vi.fn<(href: string) => void>() } }));

const prefetch = vi.mocked(router.prefetch);
const DELAY = 3000;

const pass = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** What navigation does with a prefetch: the screen mounts. Returns what closes it. */
function mountScreen() {
  return renderHook(() => useComposerMounted()).unmount;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => setTimeout(callback, 1));
  vi.stubGlobal("cancelIdleCallback", (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
  return async () => {
    // A mounted screen from the test leaves the store set; a fresh mount and close clears it.
    mountScreen()();
    vi.useRealTimers();
  };
});

describe("useComposerPreload", () => {
  test("waits for the app to settle, then loads the composer once", async () => {
    renderHook(() => useComposerPreload(true));
    await pass(DELAY - 1);
    expect(prefetch).not.toHaveBeenCalled();
    await pass(2);
    expect(prefetch).toHaveBeenCalledExactlyOnceWith("/compose");
    await pass(DELAY * 3);
    expect(prefetch).toHaveBeenCalledOnce();
  });

  test("not for a guest, who can't write", async () => {
    renderHook(() => useComposerPreload(false));
    await pass(DELAY * 2);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test("starts once someone signs in", async () => {
    const { rerender } = renderHook(({ signedIn }) => useComposerPreload(signedIn), {
      initialProps: { signedIn: false },
    });
    await pass(DELAY * 2);
    rerender({ signedIn: true });
    await pass(DELAY + 1);
    expect(prefetch).toHaveBeenCalledOnce();
  });

  test("not on iOS, where preloading a modal is untried", async () => {
    vi.spyOn(Platform, "OS", "get").mockReturnValue("ios");
    renderHook(() => useComposerPreload(true));
    await pass(DELAY * 2);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test("leaving before it fires cancels it", async () => {
    const { unmount } = renderHook(() => useComposerPreload(true));
    await pass(DELAY - 1);
    unmount();
    await pass(DELAY);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test("opening Write before it fires doesn't preload a second composer on top", async () => {
    renderHook(() => useComposerPreload(true));
    await pass(1000);
    const close = mountScreen();
    await pass(DELAY * 2);
    expect(prefetch).not.toHaveBeenCalled();
    close();
  });

  test("a waiting editor is left alone, since a second prefetch would boot it again", async () => {
    const { rerender } = renderHook(() => useComposerPreload(true));
    await pass(DELAY + 1);
    const close = mountScreen();
    rerender();
    await pass(DELAY * 3);
    expect(prefetch).toHaveBeenCalledOnce();
    close();
  });

  test("closing the composer loads a new one for next time", async () => {
    renderHook(() => useComposerPreload(true));
    await pass(DELAY + 1);
    const close = mountScreen();
    await pass(DELAY);

    act(() => close());
    await pass(DELAY - 1);
    expect(prefetch).toHaveBeenCalledOnce();
    await pass(2);
    expect(prefetch).toHaveBeenCalledTimes(2);
  });
});
