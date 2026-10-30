import type { FetchStatus } from "@tanstack/react-query";

/** What an empty list shows in place of rows. */
export type EmptyPhase = "offline" | "loading" | "error" | "empty";

export function emptyPhase(
  query: { isPending: boolean; fetchStatus: FetchStatus; error: unknown },
  offline: boolean,
): EmptyPhase {
  // Pending but idle means disabled (a private account's posts): nothing is coming, so it isn't loading.
  const waiting = query.isPending && query.fetchStatus !== "idle";
  if (waiting && offline) return "offline";
  if (waiting) return "loading";
  if (query.error) return "error";
  return "empty";
}
