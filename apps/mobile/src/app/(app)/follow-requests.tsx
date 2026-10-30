import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScrollView, View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { ActorRow } from "@/components/profile/actor-row";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { queryKeys } from "@/lib/query/keys";

/** Approve or reject requests to follow a private account. */
export default function FollowRequests() {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.followRequests,
    queryFn: async () => (await api.followRequests()).items,
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      approve ? api.approveFollowRequest(id) : api.rejectFollowRequest(id),
    onSuccess: (_result, { id }) => {
      queryClient.setQueryData<typeof query.data>(queryKeys.followRequests, (items) =>
        items?.filter((r) => r.requestId !== id),
      );
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  return (
    <Screen>
      <ScreenHeader title="Follow requests" />
      <ScrollView>
        {query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon="lock" title="No pending requests" />
        ) : (
          query.data.map((request) => (
            <ActorRow
              key={request.requestId}
              actor={request.actor}
              action={
                <View className="flex-row gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onPress={() => decide.mutate({ id: request.requestId, approve: false })}
                  >
                    Reject
                  </Button>
                  <Button
                    size="xs"
                    variant="solid"
                    onPress={() => decide.mutate({ id: request.requestId, approve: true })}
                  >
                    Approve
                  </Button>
                </View>
              }
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
