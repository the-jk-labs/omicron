import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { View } from "react-native";
import { useInstance } from "@/components/instance-provider";
import { FormScreen } from "@/components/settings/form-screen";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { describeUserAgent } from "@/lib/auth/account";
import { useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { queryKeys } from "@/lib/query/keys";

function Sessions() {
  const { auth } = useInstance();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: async () => {
      const [list, current] = await Promise.all([auth.listSessions(), auth.getSession()]);
      if (list.error) throw new Error(list.error.message ?? "Couldn't load sessions.");
      return { items: list.data ?? [], current: current.data?.session.token ?? null };
    },
    meta: { persist: false },
  });
  const revoke = useMutation({
    mutationFn: async (token: string | null) => {
      const res = token === null ? await auth.revokeOtherSessions() : await auth.revokeSession({ token });
      if (res.error) throw new Error(res.error.message ?? "Couldn't sign that device out.");
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <SettingsSection title="Signed-in devices" footer="Sign out any device you don't recognise.">
      {sessions.isPending ? (
        <View className="py-6">
          <Spinner />
        </View>
      ) : (
        sessions.data?.items.map((session) => {
          const current = session.token === sessions.data.current;
          return (
            <SettingsRow
              key={session.id}
              icon={current ? "smartphone" : "monitor-smartphone"}
              label={describeUserAgent(session.userAgent)}
              detail={`${current ? "This device · " : ""}Signed in ${formatDate(String(session.createdAt))}`}
              trailing={
                current ? undefined : (
                  <Button
                    size="xs"
                    variant="outline"
                    onPress={async () => {
                      if (
                        await confirm({
                          title: `Sign out ${describeUserAgent(session.userAgent)}?`,
                          description: "That device will need to sign in again.",
                          confirmText: "Sign out",
                          destructive: true,
                        })
                      )
                        revoke.mutate(session.token);
                    }}
                  >
                    Sign out
                  </Button>
                )
              }
            />
          );
        })
      )}
      {(sessions.data?.items.length ?? 0) > 1 && (
        <SettingsRow
          icon="log-out"
          label="Sign out all other devices"
          destructive
          onPress={async () => {
            if (
              await confirm({
                title: "Sign out all other devices?",
                description: "Every device except this one will need to sign in again.",
                confirmText: "Sign out others",
                destructive: true,
              })
            )
              revoke.mutate(null);
          }}
        />
      )}
    </SettingsSection>
  );
}

// Refetched each time the screen opens, behind the cached values it shows at once.
const REFRESH = [queryKeys.me, queryKeys.sessions];

export default function AccountSettings() {
  useRefreshOnFocus(REFRESH);
  const { auth, origin } = useInstance();
  const { user } = useViewer();
  if (!user) return null;

  return (
    <FormScreen title="Account">
      <SettingsSection title="Sign-in">
        <SettingsRow icon="at-sign" label="Username" detail={`@${user.username} · usernames are permanent`} />
        <SettingsRow
          icon="mail"
          label="Email"
          detail={user.email}
          trailing={<Badge>{user.emailVerified ? "Verified" : "Unverified"}</Badge>}
          onPress={() => router.push("/settings/change-email")}
        />
        {!user.emailVerified && user.email && (
          <SettingsRow
            icon="send"
            label="Resend confirmation link"
            onPress={async () => {
              const res = await auth.sendVerificationEmail({ email: user.email }).catch(() => null);
              toast(
                res && !res.error ? "A fresh link is on its way." : "Couldn't send the link.",
                res && !res.error ? "default" : "error",
              );
            }}
          />
        )}
        <SettingsRow
          icon="key-round"
          label="Change password"
          onPress={() => router.push("/settings/change-password")}
        />
        <SettingsRow
          icon="fingerprint"
          label="Passkeys"
          detail="Add or remove passkeys on the web"
          onPress={() => void WebBrowser.openBrowserAsync(`${origin}/settings?tab=account`)}
        />
      </SettingsSection>

      <Sessions />

      <SettingsSection title="Danger zone">
        <SettingsRow
          icon="trash-2"
          label="Delete account"
          destructive
          onPress={async () => {
            if (
              await confirm({
                title: "Delete your account?",
                description: "Permanently deletes your account, articles, and follows. This can't be undone.",
                confirmText: "Continue",
                destructive: true,
              })
            )
              router.push("/settings/delete-account");
          }}
        />
      </SettingsSection>
      <Text size="xs" tone="muted" className="px-1">
        Member since {formatDate(user.createdAt)}
      </Text>
    </FormScreen>
  );
}
