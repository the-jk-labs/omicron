import type { RelationActor } from "@omicron/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { ActorRow } from "@/components/profile/actor-row";
import { FormScreen } from "@/components/settings/form-screen";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { PillTabs } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query/keys";

type Kind = "muted" | "blocked";

function Connections() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<Kind>("muted");
  const list = useQuery({
    queryKey: kind === "muted" ? queryKeys.muted : queryKeys.blocked,
    queryFn: async () => (kind === "muted" ? await api.muted() : await api.blocked()).items,
  });
  const undo = useMutation({
    mutationFn: (actor: RelationActor) => {
      const remote = actor.remote;
      if (kind === "muted") return remote ? api.remoteUnmute(actor.username) : api.unmute(actor.username);
      return remote ? api.remoteUnblock(actor.username) : api.unblock(actor.username);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kind === "muted" ? queryKeys.muted : queryKeys.blocked });
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <View className="gap-3">
      <PillTabs
        tabs={[
          { value: "muted", label: "Muted" },
          { value: "blocked", label: "Blocked" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <View className="border-border-card bg-background-alt overflow-hidden rounded-card border">
        {list.isPending ? (
          <View className="py-6">
            <Spinner />
          </View>
        ) : !list.data?.length ? (
          <Text size="sm" tone="muted" className="p-4">
            {kind === "muted" ? "You haven't muted anyone." : "You haven't blocked anyone."}
          </Text>
        ) : (
          list.data.map((actor) => (
            <ActorRow
              key={actor.id}
              actor={actor}
              action={
                <Button size="xs" variant="outline" onPress={() => undo.mutate(actor)}>
                  {kind === "muted" ? "Unmute" : "Unblock"}
                </Button>
              }
            />
          ))
        )}
      </View>
    </View>
  );
}

// Refetched each time the screen opens, behind the cached values it shows at once.
const REFRESH = [queryKeys.me, queryKeys.muted, queryKeys.blocked];

export default function Privacy() {
  useRefreshOnFocus(REFRESH);
  const api = useApi();
  const queryClient = useQueryClient();
  const { user } = useViewer();
  const privacy = useMutation({
    mutationFn: (isPrivate: boolean) => api.setPrivacy(isPrivate),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me }),
    onError: (error) => toast(errorMessage(error), "error"),
  });
  if (!user) return null;

  return (
    <FormScreen title="Privacy">
      <SettingsSection footer="Only approved followers can see your posts, and new followers need your approval.">
        <SettingsRow
          icon="lock"
          label="Private account"
          trailing={
            <Switch
              checked={user.isPrivate}
              label="Private account"
              onCheckedChange={async (isPrivate) => {
                if (
                  isPrivate ||
                  (await confirm({
                    title: "Make your account public?",
                    description:
                      "Anyone will be able to see your posts and follow you, and pending follow requests are approved.",
                    confirmText: "Make public",
                  }))
                )
                  privacy.mutate(isPrivate);
              }}
            />
          }
        />
      </SettingsSection>
      <Connections />
    </FormScreen>
  );
}
