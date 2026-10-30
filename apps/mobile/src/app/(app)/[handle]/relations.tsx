import { LegendList } from "@legendapp/list/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { ActorRow } from "@/components/profile/actor-row";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { UnderlineTabs } from "@/components/ui/tabs";
import { useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { usernameFromHandle } from "@/lib/links";
import { queryKeys } from "@/lib/query/keys";

type Kind = "followers" | "following";

/** Followers and following, switchable, with "Remove follower" on your own profile (as on the web). */
export default function Relations() {
  const params = useLocalSearchParams<{ handle: string; kind?: Kind }>();
  const username = usernameFromHandle(params.handle);
  const api = useApi();
  const queryClient = useQueryClient();
  const { user } = useViewer();
  const [kind, setKind] = useState<Kind>(params.kind === "following" ? "following" : "followers");
  const isSelf = user?.username === username;

  const query = useQuery({
    queryKey: queryKeys.followers(username, kind),
    queryFn: async () =>
      (kind === "followers" ? await api.userFollowers(username) : await api.userFollowing(username)).items,
  });
  const removeFollower = useMutation({
    mutationFn: (identifier: string) => api.removeFollower(identifier),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followers(username, "followers") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile(username) });
    },
  });

  return (
    <Screen>
      <ScreenHeader title={`@${username}`} />
      <UnderlineTabs
        tabs={[
          { value: "followers", label: "Followers" },
          { value: "following", label: "Following" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <LegendList
        key={kind}
        data={query.data ?? []}
        keyExtractor={(actor) => actor.id}
        estimatedItemSize={64}
        recycleItems
        renderItem={({ item }) => (
          <ActorRow
            actor={item}
            action={
              isSelf && kind === "followers" ? (
                <Button
                  size="xs"
                  variant="outline"
                  onPress={async () => {
                    if (
                      await confirm({
                        title: `Remove @${item.username}?`,
                        description: "They won't be told, and can follow you again.",
                        confirmText: "Remove",
                        destructive: true,
                      })
                    )
                      removeFollower.mutate(item.username);
                  }}
                >
                  Remove
                </Button>
              ) : undefined
            }
          />
        )}
        ListEmptyComponent={
          query.isPending ? (
            <LoadingState />
          ) : query.error ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <EmptyState icon="users" title={kind === "followers" ? "No followers yet" : "Not following anyone yet"} />
          )
        }
      />
    </Screen>
  );
}
