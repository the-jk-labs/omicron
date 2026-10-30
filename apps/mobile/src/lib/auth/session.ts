import type { Me } from "@omicron/contract";
import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { useInstance } from "@/components/instance-provider";
import { clearPersistedCache } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";

/** The signed-in user (`GET /api/me`), cached and persisted so a cold start shows it at once. */
export function useViewer() {
  const { api } = useInstance();
  const query = useQuery({ queryKey: queryKeys.me, queryFn: async () => (await api.me()).user });
  const user: Me | null = query.data ?? null;
  return { user, signedIn: user !== null, isPending: query.isPending, refetch: query.refetch };
}

/** Everything cached for the signed-in account; `me` itself is set rather than dropped. */
const accountData = (query: Query) => query.queryKey[0] !== "me";

export function useSignOut() {
  const { auth, origin } = useInstance();
  const queryClient = useQueryClient();
  return async () => {
    await auth.signOut().catch(() => undefined);
    // Update queries in place rather than clear(): open screens watch these, and a dropped query never told them.
    queryClient.setQueryData(queryKeys.me, null);
    clearPersistedCache(origin);
    // Nothing from this session may show to the next one: unwatched data goes, watched data reloads as a guest.
    queryClient.removeQueries({ predicate: (query) => accountData(query) && query.getObserversCount() === 0 });
    void queryClient.resetQueries({ predicate: accountData });
  };
}

/** Refreshes everything that depends on who is signed in, after sign-in or sign-up. */
export function useSessionChanged() {
  const queryClient = useQueryClient();
  return async () => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    await queryClient.refetchQueries({ queryKey: queryKeys.me });
  };
}
