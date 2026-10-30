import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/components/instance-provider";
import { queryKeys } from "./keys";

// The web polls at the same rate; the backend has no push channel.
const POLL_MS = 30_000;

/** Unread notification count, polled while the app is in the foreground. */
export function useUnreadCount(enabled: boolean): number {
  const api = useApi();
  const { data } = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: async () => (await api.unreadNotificationCount()).count,
    enabled,
    refetchInterval: POLL_MS,
    meta: { persist: false },
  });
  return enabled ? (data ?? 0) : 0;
}
