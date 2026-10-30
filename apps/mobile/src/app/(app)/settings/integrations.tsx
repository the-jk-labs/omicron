import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { FormScreen } from "@/components/settings/form-screen";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";

const CONNECTED_APPS = ["connected-apps"] as const;

function PublishingTokens() {
  const api = useApi();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const tokens = useQuery({
    queryKey: queryKeys.webhookTokens,
    queryFn: async () => (await api.webhookTokens()).tokens,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.webhookTokens });
  const create = useMutation({
    mutationFn: () => api.createWebhookToken(label.trim()),
    onSuccess: ({ token }) => {
      setCreated(token);
      setLabel("");
      void refresh();
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeWebhookToken(id),
    onSuccess: () => void refresh(),
  });

  return (
    <SettingsSection
      title="Publishing tokens"
      footer="Let a CMS or script publish to your account through the content webhook."
    >
      {created && (
        <Card className="m-3 gap-2">
          <Text size="sm" weight="semibold">
            Copy your token now. It won&apos;t be shown again.
          </Text>
          <Text selectable size="xs" className="font-mono">
            {created}
          </Text>
          <Button
            variant="outline"
            size="sm"
            icon="copy"
            className="self-start"
            onPress={() => {
              void Clipboard.setStringAsync(created);
              toast("Token copied");
            }}
          >
            Copy
          </Button>
        </Card>
      )}
      {tokens.data?.map((token) => (
        <SettingsRow
          key={token.id}
          icon="key-round"
          label={token.label}
          detail={`Created ${formatDate(token.createdAt)} · ${token.lastUsedAt ? `last used ${formatDate(token.lastUsedAt)}` : "never used"}`}
          trailing={
            <Button
              size="xs"
              variant="outline"
              onPress={async () => {
                if (
                  await confirm({
                    title: `Revoke “${token.label}”?`,
                    description: "Anything using it stops working.",
                    confirmText: "Revoke",
                    destructive: true,
                  })
                )
                  revoke.mutate(token.id);
              }}
            >
              Revoke
            </Button>
          }
        />
      ))}
      <View className="flex-row gap-2 p-3">
        <Input value={label} onChangeText={setLabel} placeholder="Token name, e.g. Ghost" className="flex-1" />
        <Button variant="solid" loading={create.isPending} disabled={!label.trim()} onPress={() => create.mutate()}>
          Create
        </Button>
      </View>
    </SettingsSection>
  );
}

function ConnectedApps() {
  const api = useApi();
  const queryClient = useQueryClient();
  const apps = useQuery({ queryKey: CONNECTED_APPS, queryFn: async () => (await api.connectedApps()).connections });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeConnectedApp(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CONNECTED_APPS }),
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <SettingsSection
      title="Connected applications"
      footer="Apps you've let use your account. Disconnecting signs them out."
    >
      {!apps.data?.length ? (
        <Text size="sm" tone="muted" className="p-4">
          No connected applications.
        </Text>
      ) : (
        apps.data.map((app) => (
          <SettingsRow
            key={app.id}
            icon="plug"
            label={app.name}
            detail={`${app.callbackOrigin} · connected ${formatDate(app.createdAt)}`}
            trailing={
              <Button
                size="xs"
                variant="outline"
                onPress={async () => {
                  if (await confirm({ title: `Disconnect ${app.name}?`, confirmText: "Disconnect", destructive: true }))
                    revoke.mutate(app.id);
                }}
              >
                Disconnect
              </Button>
            }
          />
        ))
      )}
    </SettingsSection>
  );
}

// Refetched each time the screen opens, behind the cached values it shows at once.
const REFRESH = [queryKeys.webhookTokens, CONNECTED_APPS];

export default function Integrations() {
  useRefreshOnFocus(REFRESH);
  return (
    <FormScreen title="Integrations">
      <PublishingTokens />
      <ConnectedApps />
    </FormScreen>
  );
}
