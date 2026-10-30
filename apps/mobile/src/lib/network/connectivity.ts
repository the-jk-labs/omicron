import { onlineManager } from "@tanstack/react-query";
import { fetch as nitroFetch } from "react-native-nitro-fetch";
import * as z from "zod/mini";
import type { Fetcher } from "@/lib/api/client";
import { createStore } from "@/lib/store";

// Two independent facts decide whether the app may make requests: the device has a connection, and the
// instance answers. TanStack Query only runs while both hold, so nothing is fetched into a dead network and
// cached data stays on screen.

export type Connectivity = {
  /** Unknown until the first network probe settles. */
  device: "online" | "offline" | "unknown";
  instance: "up" | "down";
};

export const connectivity = createStore<Connectivity>({ device: "unknown", instance: "up" });

const sync = () => {
  const { device, instance } = connectivity.get();
  onlineManager.setOnline(device !== "offline" && instance === "up");
};
connectivity.subscribe(sync);

export function setDeviceOnline(online: boolean) {
  if (connectivity.get().device === (online ? "online" : "offline")) return;
  connectivity.set((current) => ({ ...current, device: online ? "online" : "offline" }));
}

const healthSchema = z.object({ status: z.literal("ok") });
const RECHECK_MS = 15_000;
let recheck: ReturnType<typeof setTimeout> | null = null;

/** `GET /healthz`: the backend's public liveness check, routed past the bot wall. */
export async function isInstanceUp(origin: string, fetch: Fetcher = nitroFetch): Promise<boolean> {
  try {
    const res = await fetch(`${origin}/healthz`, { headers: { accept: "application/json" }, credentials: "omit" });
    return res.ok && healthSchema.safeParse(await res.json()).success;
  } catch {
    return false;
  }
}

function scheduleRecheck(origin: string) {
  if (recheck) clearTimeout(recheck);
  recheck = setTimeout(() => {
    recheck = null;
    void confirmInstance(origin);
  }, RECHECK_MS);
}

/** Probes the instance and records the answer; while it is down, probes again until it answers. */
export async function confirmInstance(origin: string): Promise<boolean> {
  const up = await isInstanceUp(origin);
  connectivity.set((current) => ({ ...current, instance: up ? "up" : "down" }));
  if (!up) scheduleRecheck(origin);
  return up;
}

/**
 * A request failed at the transport level or with a gateway error. While the device is online that means the
 * instance may be down: confirm with /healthz before pausing everything, so one flaky request doesn't.
 */
export function reportRequestFailure(origin: string) {
  const { device, instance } = connectivity.get();
  if (device === "offline" || instance === "down" || recheck) return;
  void confirmInstance(origin);
}

/** Leaving an instance (switching, signing out of it) forgets its outage. */
export function resetInstanceStatus() {
  if (recheck) clearTimeout(recheck);
  recheck = null;
  connectivity.set((current) => ({ ...current, instance: "up" }));
}
