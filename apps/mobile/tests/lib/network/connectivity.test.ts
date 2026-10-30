import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Fetcher } from "@/lib/api/client";
import { connectivity, isInstanceUp, resetInstanceStatus, setDeviceOnline } from "@/lib/network/connectivity";
import { jsonResponse } from "../../support/http";

afterEach(() => {
  resetInstanceStatus();
  setDeviceOnline(true);
});

describe("isInstanceUp", () => {
  test("only a healthy /healthz answer counts", async () => {
    const healthy = vi.fn<Fetcher>(async () => jsonResponse({ status: "ok" }));
    await expect(isInstanceUp("https://blog.test", healthy)).resolves.toBe(true);
    expect(healthy).toHaveBeenCalledWith("https://blog.test/healthz", expect.objectContaining({ credentials: "omit" }));

    await expect(
      isInstanceUp(
        "https://blog.test",
        vi.fn<Fetcher>(async () => jsonResponse({ status: "ok" }, 502)),
      ),
    ).resolves.toBe(false);
    await expect(
      isInstanceUp(
        "https://blog.test",
        vi.fn<Fetcher>(async () => new Response("<html>")),
      ),
    ).resolves.toBe(false);
    await expect(
      isInstanceUp(
        "https://blog.test",
        vi.fn<Fetcher>(async () => Promise.reject(new Error("offline"))),
      ),
    ).resolves.toBe(false);
  });
});

describe("onlineManager follows connectivity", () => {
  test("queries pause offline and when the instance is down, and resume when both recover", () => {
    setDeviceOnline(false);
    expect(onlineManager.isOnline()).toBe(false);
    setDeviceOnline(true);
    expect(onlineManager.isOnline()).toBe(true);

    connectivity.set((current) => ({ ...current, instance: "down" }));
    expect(onlineManager.isOnline()).toBe(false);
    resetInstanceStatus();
    expect(onlineManager.isOnline()).toBe(true);
  });
});
