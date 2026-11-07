// @vitest-environment happy-dom
// oxlint-disable typescript/no-unsafe-type-assertion, typescript/unbound-method -- deliberately partial test doubles
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import * as Updates from "expo-updates";
import { AppState } from "react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { toasts } from "@/lib/dialogs/toast";
import { downloadLatestUpdate, isCheckDue, shouldDismissSwipe, useOtaUpdate } from "@/lib/updates/ota";

const state = vi.hoisted(() => ({
  isEnabled: true,
  updates: {} as Record<string, unknown>,
}));

vi.mock("expo-updates", () => ({
  get isEnabled() {
    return state.isEnabled;
  },
  useUpdates: () => state.updates,
  checkForUpdateAsync: vi.fn<() => Promise<unknown>>(),
  fetchUpdateAsync: vi.fn<() => Promise<unknown>>(),
  reloadAsync: vi.fn<() => Promise<void>>(),
}));

const check = vi.mocked(Updates.checkForUpdateAsync);
const fetchUpdate = vi.mocked(Updates.fetchUpdateAsync);
const reload = vi.mocked(Updates.reloadAsync);
const listen = vi.mocked(AppState.addEventListener);

const MINUTE = 60_000;
const pending = (updateId: string | undefined) => ({ isUpdatePending: true, downloadedUpdate: { updateId } });

/** Sends the app to the foreground, as the latest listener registered sees it. */
function comeBack() {
  const listener = listen.mock.calls.at(-1)?.[1];
  listener?.("active");
}

// Only EAS Build adds a channel on its own; without one the update server answers every check with a 400.
test("builds made outside EAS still ask for an update channel", () => {
  expect(readFileSync(resolve("app.config.ts"), "utf8")).toContain(
    'requestHeaders: { "expo-channel-name": IS_DEV ? "development" : "production" }',
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  state.isEnabled = true;
  state.updates = { isUpdatePending: false };
  check.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: false } as never);
  fetchUpdate.mockResolvedValue({} as never);
  reload.mockResolvedValue(undefined);
  toasts.set([]);
});

describe("isCheckDue", () => {
  const now = 100 * MINUTE;

  test("is due when nothing was checked since launch", () => {
    expect(isCheckDue(undefined, now)).toBe(true);
  });

  test("waits half an hour after a check", () => {
    expect(isCheckDue(new Date(now - 29 * MINUTE), now)).toBe(false);
    expect(isCheckDue(new Date(now - 30 * MINUTE), now)).toBe(true);
  });
});

describe("shouldDismissSwipe", () => {
  test("a long enough upward drag dismisses", () => {
    expect(shouldDismissSwipe(-40, 0)).toBe(true);
  });

  test("a short upward flick dismisses", () => {
    expect(shouldDismissSwipe(-10, -600)).toBe(true);
  });

  test("a short slow drag springs back", () => {
    expect(shouldDismissSwipe(-39, -100)).toBe(false);
  });

  test("flicking back down after dragging up doesn't count as a flick up", () => {
    expect(shouldDismissSwipe(-20, 800)).toBe(false);
  });
});

describe("downloadLatestUpdate", () => {
  test("downloads nothing when there is nothing new", async () => {
    await downloadLatestUpdate();
    expect(check).toHaveBeenCalledOnce();
    expect(fetchUpdate).not.toHaveBeenCalled();
  });

  test("downloads a new update", async () => {
    check.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false } as never);
    await downloadLatestUpdate();
    expect(fetchUpdate).toHaveBeenCalledOnce();
  });

  test("downloads a rollback, which reports no available update", async () => {
    check.mockResolvedValue({ isAvailable: false, isRollBackToEmbedded: true } as never);
    await downloadLatestUpdate();
    expect(fetchUpdate).toHaveBeenCalledOnce();
  });

  test.each(["check", "download"])("a failed %s stays quiet", async (step) => {
    if (step === "check") check.mockRejectedValue(new Error("offline"));
    else {
      check.mockResolvedValue({ isAvailable: true, isRollBackToEmbedded: false } as never);
      fetchUpdate.mockRejectedValue(new Error("disk full"));
    }
    await expect(downloadLatestUpdate()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe("useOtaUpdate", () => {
  test("hides while no update is pending", () => {
    const { result } = renderHook(() => useOtaUpdate());
    expect(result.current.visible).toBe(false);
  });

  test("shows once an update is downloaded, and never reloads by itself", () => {
    state.updates = pending("a");
    const { result } = renderHook(() => useOtaUpdate());
    expect(result.current.visible).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  test("shows for a rollback, which has no id", () => {
    state.updates = pending(undefined);
    const { result } = renderHook(() => useOtaUpdate());
    expect(result.current.visible).toBe(true);
  });

  test("dismissing hides it without restarting", () => {
    state.updates = pending("a");
    const { result, rerender } = renderHook(() => useOtaUpdate());
    act(() => result.current.dismiss());
    rerender();
    expect(result.current.visible).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  test("a newer update shows again after the last one was dismissed", () => {
    state.updates = pending("a");
    const { result, rerender } = renderHook(() => useOtaUpdate());
    act(() => result.current.dismiss());
    state.updates = pending("b");
    rerender();
    expect(result.current.visible).toBe(true);
  });

  test("restart reloads into the update", () => {
    state.updates = pending("a");
    const { result } = renderHook(() => useOtaUpdate());
    act(() => result.current.restart());
    expect(reload).toHaveBeenCalledOnce();
    expect(result.current.restarting).toBe(true);
  });

  test("a failed restart says so and lets them try again", async () => {
    reload.mockRejectedValue(new Error("no"));
    state.updates = pending("a");
    const { result } = renderHook(() => useOtaUpdate());
    await act(async () => result.current.restart());
    expect(result.current.restarting).toBe(false);
    expect(toasts.get()).toMatchObject([{ tone: "error" }]);
  });

  test("coming back checks again when one is due", () => {
    state.updates = { lastCheckForUpdateTimeSinceRestart: new Date(Date.now() - 31 * MINUTE) };
    renderHook(() => useOtaUpdate());
    comeBack();
    expect(check).toHaveBeenCalledOnce();
  });

  test("coming back soon after a check leaves it", () => {
    state.updates = { lastCheckForUpdateTimeSinceRestart: new Date(Date.now() - MINUTE) };
    renderHook(() => useOtaUpdate());
    comeBack();
    expect(check).not.toHaveBeenCalled();
  });

  test.each(["isChecking", "isDownloading", "isStartupProcedureRunning"])(
    "coming back while %s doesn't start a second check",
    (flag) => {
      state.updates = { [flag]: true };
      renderHook(() => useOtaUpdate());
      comeBack();
      expect(check).not.toHaveBeenCalled();
    },
  );

  test("does nothing in a build with updates off, as in development", () => {
    state.isEnabled = false;
    renderHook(() => useOtaUpdate());
    expect(listen).not.toHaveBeenCalled();
  });

  test("stops listening on unmount", () => {
    const remove = vi.fn<() => void>();
    listen.mockReturnValueOnce({ remove });
    const { unmount } = renderHook(() => useOtaUpdate());
    unmount();
    expect(remove).toHaveBeenCalledOnce();
  });
});
