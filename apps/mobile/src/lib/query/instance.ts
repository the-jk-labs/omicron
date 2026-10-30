import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/components/instance-provider";
import { queryKeys } from "./keys";

/** The instance's public identity and policies (`GET /api/instance`). */
export function useInstanceInfo() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.instance, queryFn: api.instance, staleTime: 10 * 60_000 });
}
