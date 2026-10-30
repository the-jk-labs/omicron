import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { postPath } from "@/lib/links";
import { queryKeys } from "@/lib/query/keys";

/** `/posts/:id` (notification links) forwards to the post's canonical `/@user/slug`, as the web does. */
export default function PostById() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const {
    data: post,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.postById(id),
    queryFn: async () => (await api.post(id)).post,
  });

  useEffect(() => {
    if (post) router.replace(postPath(post));
  }, [post]);

  return (
    <Screen>
      <ScreenHeader />
      {error ? <ErrorState error={error} onRetry={() => void refetch()} /> : <LoadingState />}
    </Screen>
  );
}
