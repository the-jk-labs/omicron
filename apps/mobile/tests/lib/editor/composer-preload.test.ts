import { act, renderHook } from "@testing-library/react-native";
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
async function mountScreen() {
  return (await renderHook(() => useComposerMounted())).unmount;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => setTimeout(callback, 1));
  vi.stubGlobal("cancelIdleCallback", (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
  return async () => {
    // A mounted screen from the test leaves the store set; a fresh mount and close clears it.
    await (
      await mountScreen()
    )();
    vi.useRealTimers();
  };
});

describe("useComposerPreload", () => {
  test("waits for the app to settle, then loads the composer once", async () => {
    await renderHook(() => useComposerPreload(true));
    await pass(DELAY - 1);
    expect(prefetch).not.toHaveBeenCalled();
    await pass(2);
    expect(prefetch).toHaveBeenCalledExactlyOnceWith("/compose");
    await pass(DELAY * 3);
    expect(prefetch).toHaveBeenCalledOnce();
  });

  test("not for a guest, who can't write", async () => {
    await renderHook(() => useComposerPreload(false));
    await pass(DELAY * 2);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test("starts once someone signs in", async () => {
    const { rerender } = await renderHook(({ signedIn }: { signedIn: boolean }) => useComposerPreload(signedIn), {
      initialProps: { signedIn: false },
    });
    await pass(DELAY * 2);
    await rerender({ signedIn: true });
    await pass(DELAY + 1);
    expect(prefetch).toHaveBeenCalledOnce();
  });

  test("not on iOS, where preloading a modal is untried", async () => {
    vi.spyOn(Platform, "OS", "get").mockReturnValue("ios");
    await renderHook(() => useComposerPreload(true));
    await pass(DELAY * 2);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test("leaving before it fires cancels it", async () => {
    const { unmount } = await renderHook(() => useComposerPreload(true));
    await pass(DELAY - 1);
    await unmount();
    await pass(DELAY);
    expect(prefetch).not.toHaveBeenCalled();
  });

  test("opening Write before it fires doesn't preload a second composer on top", async () => {
    await renderHook(() => useComposerPreload(true));
    await pass(1000);
    const close = await mountScreen();
    await pass(DELAY * 2);
    expect(prefetch).not.toHaveBeenCalled();
    await close();
  });

  test("a waiting editor is left alone, since a second prefetch would boot it again", async () => {
    const { rerender } = await renderHook(() => useComposerPreload(true));
    await pass(DELAY + 1);
    const close = await mountScreen();
    await rerender({});
    await pass(DELAY * 3);
    expect(prefetch).toHaveBeenCalledOnce();
    await close();
  });

  test("closing the composer loads a new one for next time", async () => {
    await renderHook(() => useComposerPreload(true));
    await pass(DELAY + 1);
    const close = await mountScreen();
    await pass(DELAY);

    await close();
    await pass(DELAY - 1);
    expect(prefetch).toHaveBeenCalledOnce();
    await pass(2);
    expect(prefetch).toHaveBeenCalledTimes(2);
  });
});
