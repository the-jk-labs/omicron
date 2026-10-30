import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { createApiClient } from "@/lib/api/client";
import { createEndpoints } from "@/lib/api/endpoints";
import { createInstanceAuthClient, type InstanceAuthClient } from "@/lib/auth/auth-client";
import { mediaUrl } from "@/lib/instance/origin";
import type { SavedInstance } from "@/lib/instance/store";
import { reportRequestFailure, resetInstanceStatus } from "@/lib/network/connectivity";
import { createQueryClient, persistOptionsFor } from "@/lib/query/client";

export type InstanceContextValue = {
  origin: string;
  name: string;
  auth: InstanceAuthClient;
  api: ReturnType<typeof createEndpoints>;
  /** Resolves an API media URL to something `expo-image` can load (proxying external images). */
  media: (url: string | null | undefined) => string | undefined;
};

const InstanceContext = createContext<InstanceContextValue | null>(null);

function createInstance({ origin, name }: SavedInstance): InstanceContextValue {
  const auth = createInstanceAuthClient(origin);
  const client = createApiClient({
    origin,
    getCookie: () => auth.getCookie(),
    onUnreachable: () => reportRequestFailure(origin),
  });
  return { origin, name, auth, api: createEndpoints(client), media: (url) => mediaUrl(origin, url) };
}

/**
 * Everything bound to one instance: auth, API, and a query cache persisted under its origin.
 * Mount it with `key={origin}` so switching instances starts from a clean slate.
 */
export function InstanceProvider({ instance, children }: { instance: SavedInstance; children: ReactNode }) {
  const [value] = useState(() => createInstance(instance));
  // An outage belongs to the instance it was seen on.
  useEffect(() => resetInstanceStatus, []);
  const [queryClient] = useState(createQueryClient);
  const [persistOptions] = useState(() => persistOptionsFor(instance.origin));

  return (
    <InstanceContext value={value}>
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        {children}
      </PersistQueryClientProvider>
    </InstanceContext>
  );
}

export function useInstance(): InstanceContextValue {
  const value = use(InstanceContext);
  if (!value) throw new Error("useInstance must be used inside <InstanceProvider>");
  return value;
}

export const useApi = () => useInstance().api;
