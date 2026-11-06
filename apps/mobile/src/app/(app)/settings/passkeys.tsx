import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { View } from "react-native";
import { FormError } from "@/components/auth/auth-shell";
import { useInstance } from "@/components/instance-provider";
import { ConfirmPasswordForm } from "@/components/settings/confirm-password-form";
import { FormScreen } from "@/components/settings/form-screen";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { addPasskey, loadPasskeys, passkeyLabel, usePasskeysAvailable, type Passkey } from "@/lib/auth/passkeys";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";

const NAME_MAX = 60;
const REFRESH = [queryKeys.passkeys];

function PasskeyRow({ passkey }: { passkey: Passkey }) {
  const { auth } = useInstance();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.passkeys });

  const rename = useMutation({
    mutationFn: async (name: string) => {
      const res = await auth.passkey.updatePasskey({ id: passkey.id, name });
      if (res.error) throw new Error(res.error.message ?? "Couldn't rename the passkey.");
    },
    onSuccess: async () => {
      await refresh();
      setDraft(null);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const res = await auth.passkey.deletePasskey({ id: passkey.id });
      if (res.error) throw new Error(res.error.message ?? "Couldn't remove the passkey.");
    },
    onSuccess: refresh,
    onError: (error) => toast(errorMessage(error), "error"),
  });

  if (draft !== null) {
    return (
      <View className="gap-2 border-b border-border p-4 last:border-b-0">
        <Input
          value={draft}
          onChangeText={setDraft}
          maxLength={NAME_MAX}
          autoFocus
          accessibilityLabel="Passkey name"
          placeholder="e.g. Work phone"
        />
        <View className="flex-row justify-end gap-2">
          <Button size="sm" variant="ghost" onPress={() => setDraft(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={rename.isPending}
            disabled={!draft.trim()}
            onPress={() => rename.mutate(draft.trim())}
          >
            Save
          </Button>
        </View>
      </View>
    );
  }

  return (
    <SettingsRow
      icon="key-round"
      label={passkeyLabel(passkey)}
      detail={`${passkey.backedUp ? "Synced" : "This device only"} · Added ${formatDate(new Date(passkey.createdAt).toISOString())}`}
      trailing={
        <View className="flex-row">
          <IconButton
            icon="pencil"
            label={`Rename ${passkeyLabel(passkey)}`}
            size={18}
            onPress={() => setDraft(passkey.name ?? "")}
          />
          <IconButton
            icon="trash-2"
            label={`Remove ${passkeyLabel(passkey)}`}
            size={18}
            onPress={async () => {
              if (
                await confirm({
                  title: "Remove this passkey?",
                  description: `You won't be able to sign in with "${passkeyLabel(passkey)}" anymore. Your password and other passkeys keep working.`,
                  confirmText: "Remove",
                  destructive: true,
                })
              )
                remove.mutate();
            }}
          />
        </View>
      }
    />
  );
}

/** The web's PasskeysManager: add a passkey, rename it or remove it. */
export default function Passkeys() {
  useRefreshOnFocus(REFRESH);
  // `confirm`: opened from the offer, whose add found the sign-in too old.
  const { confirm: confirmFirst } = useLocalSearchParams<{ confirm?: string }>();
  const { auth, origin } = useInstance();
  const queryClient = useQueryClient();
  const available = usePasskeysAvailable();
  const passkeys = useQuery({
    queryKey: queryKeys.passkeys,
    queryFn: () => loadPasskeys(auth),
    meta: { persist: false },
  });
  const [confirming, setConfirming] = useState(confirmFirst === "1");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    setAdding(true);
    const result = await addPasskey(auth);
    setAdding(false);
    if (result === "needs-password") setConfirming(true);
    else if (result === "added") await queryClient.invalidateQueries({ queryKey: queryKeys.passkeys });
    else if (result !== "cancelled") setError(result.message);
  };

  if (confirming) {
    return (
      <FormScreen title="Confirm it's you">
        <Text tone="muted">For your security, enter your password before adding a new way to sign in.</Text>
        <ConfirmPasswordForm
          onConfirmed={() => {
            setConfirming(false);
            void add();
          }}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Passkeys">
      <Text tone="muted">Sign in with your fingerprint, face, or screen lock.</Text>
      <SettingsSection>
        {passkeys.isPending ? (
          <View className="py-6">
            <Spinner />
          </View>
        ) : passkeys.isError && !passkeys.data ? (
          <SettingsRow
            icon="triangle-alert"
            label={errorMessage(passkeys.error)}
            detail="Tap to try again."
            onPress={() => void passkeys.refetch()}
          />
        ) : passkeys.data?.length === 0 ? (
          <Text tone="muted" className="p-6 text-center">
            No passkeys yet.
          </Text>
        ) : (
          passkeys.data?.map((passkey) => <PasskeyRow key={passkey.id} passkey={passkey} />)
        )}
      </SettingsSection>
      <FormError message={error} />
      {available ? (
        <Button variant="solid" icon="plus" loading={adding} onPress={() => void add()}>
          {adding ? "Waiting for your device…" : "Add a passkey"}
        </Button>
      ) : (
        <>
          <Text size="sm" tone="muted">
            Adding a passkey in the app isn&apos;t available here. You can add one on the web.
          </Text>
          <Button variant="outline" onPress={() => void WebBrowser.openBrowserAsync(`${origin}/settings?tab=account`)}>
            Open settings on the web
          </Button>
        </>
      )}
    </FormScreen>
  );
}
