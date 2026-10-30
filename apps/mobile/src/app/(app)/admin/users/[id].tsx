import type { AdminUserDetail } from "@omicron/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { useApi } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { UserAvatar } from "@/components/post/post-bits";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { useViewer } from "@/lib/auth/session";
import { confirmDialog } from "@/lib/dialogs/confirm";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { postPath, profilePath } from "@/lib/links";
import { goBack } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";

type PasswordAction = { kind: "admin" | "moderator"; grant: boolean } | { kind: "delete" };

/** Password-confirmed actions (roles, deletion), which the server re-verifies with the acting admin's password. */
function PasswordConfirmed({
  action,
  username,
  onDone,
}: {
  action: PasswordAction;
  username: string;
  onDone: () => void;
}) {
  const api = useApi();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [password, setPassword] = useState("");
  const autofill = useAutofillFields();
  const [typed, setTyped] = useState("");
  const [notify, setNotify] = useState(false);
  const run = useMutation({
    mutationFn: () =>
      action.kind === "delete"
        ? api.deleteUser(id, { username: typed, password, notify })
        : action.kind === "admin"
          ? api.setUserRole(id, { makeAdmin: action.grant, password, notify })
          : api.setUserModeratorRole(id, { makeModerator: action.grant, password, notify }),
    onSuccess: onDone,
  });
  const title =
    action.kind === "delete"
      ? `Delete @${username}`
      : `${action.grant ? "Make" : "Remove"} ${action.kind === "admin" ? "admin" : "moderator"}`;

  return (
    <View className="gap-3 rounded-card border border-border p-4">
      <Text weight="semibold">{title}</Text>
      {action.kind === "delete" && (
        <Field label={`Type ${username} to confirm`}>
          <Input value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
        </Field>
      )}
      <Field label="Your password">
        <PasswordInput
          {...autofill("password")}
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
        />
      </Field>
      <Checkbox checked={notify} onCheckedChange={setNotify} label="Tell them by email" />
      <FormError message={run.error ? errorMessage(run.error) : null} />
      <Button
        variant={action.kind === "delete" || !action.grant ? "destructive" : "solid"}
        loading={run.isPending}
        disabled={!password || (action.kind === "delete" && typed !== username)}
        onPress={() => run.mutate()}
      >
        {title}
      </Button>
    </View>
  );
}

type Detail = AdminUserDetail;

const refreshAdmin = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("admin") });

function UserSummary({ detail }: { detail: Detail }) {
  const { user } = detail;
  return (
    <>
      <View className="flex-row items-center gap-3">
        <UserAvatar name={user.displayName} url={user.avatarUrl} size={56} />
        <View className="flex-1 gap-1">
          <Text size="lg" weight="bold">
            {user.displayName}
          </Text>
          <Text size="sm" tone="muted">
            {user.email} · joined {formatDate(user.createdAt)}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {user.suspended && <Badge>Suspended</Badge>}
            {user.isAdmin && <Badge>Admin</Badge>}
            {user.isModerator && <Badge>Moderator</Badge>}
            <Badge>{user.emailVerified ? "Verified" : "Unverified"}</Badge>
          </View>
        </View>
      </View>
      <Text size="sm" tone="muted">
        {detail.postCounts.published} published · {detail.postCounts.draft} drafts · {detail.followCounts.followers}{" "}
        followers · {detail.followCounts.following} following
      </Text>
    </>
  );
}

const DONE: Record<"suspend" | "unsuspend" | "resend" | "verify", string> = {
  suspend: "Suspended",
  unsuspend: "Unsuspended",
  resend: "Verification email sent",
  verify: "Email marked verified",
};

function ModerationActions({ detail }: { detail: Detail }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { id, suspended, emailVerified, username } = detail.user;
  const act = useMutation({
    mutationFn: async (action: keyof typeof DONE) => {
      if (action === "resend") return api.resendVerification(id);
      if (action === "verify") return api.verifyEmail(id);
      const suspend = action === "suspend";
      const { confirmed, notify } = await confirmDialog({
        title: suspend ? "Suspend this account?" : "Unsuspend this account?",
        description: suspend ? "They can't sign in or post until unsuspended." : undefined,
        confirmText: suspend ? "Suspend" : "Unsuspend",
        destructive: suspend,
        notify: "Tell them by email",
      });
      return confirmed ? api.suspendUser(id, suspend, notify) : null;
    },
    onSuccess: (result, action) => {
      if (result === null) return;
      toast(DONE[action]);
      void refreshAdmin(queryClient);
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <SettingsSection title="Moderation">
      <SettingsRow icon="user" label="View profile" onPress={() => router.push(profilePath(username))} />
      <SettingsRow
        icon={suspended ? "user-check" : "ban"}
        label={suspended ? "Unsuspend" : "Suspend"}
        destructive={!suspended}
        onPress={() => act.mutate(suspended ? "unsuspend" : "suspend")}
      />
      {!emailVerified && (
        <>
          <SettingsRow icon="send" label="Resend verification email" onPress={() => act.mutate("resend")} />
          <SettingsRow icon="badge-check" label="Mark email verified" onPress={() => act.mutate("verify")} />
        </>
      )}
    </SettingsSection>
  );
}

function RoleActions({ detail }: { detail: Detail }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<PasswordAction | null>(null);
  const { isAdmin, isModerator, username } = detail.user;
  return (
    <>
      <SettingsSection title="Roles and account" footer="These need your password.">
        <SettingsRow
          icon="shield-check"
          label={isAdmin ? "Remove admin" : "Make admin"}
          onPress={() => setAction({ kind: "admin", grant: !isAdmin })}
        />
        <SettingsRow
          icon="gavel"
          label={isModerator ? "Remove moderator" : "Make moderator"}
          onPress={() => setAction({ kind: "moderator", grant: !isModerator })}
        />
        <SettingsRow icon="trash-2" label="Delete account" destructive onPress={() => setAction({ kind: "delete" })} />
      </SettingsSection>
      {action && (
        <PasswordConfirmed
          key={JSON.stringify(action)}
          action={action}
          username={username}
          onDone={() => {
            toast("Done");
            setAction(null);
            void refreshAdmin(queryClient);
            if (action.kind === "delete") goBack();
          }}
        />
      )}
    </>
  );
}

function RecentActivity({ detail }: { detail: Detail }) {
  const { username } = detail.user;
  return (
    <>
      {detail.recentPosts.length > 0 && (
        <SettingsSection title="Recent posts">
          {detail.recentPosts.map((post) => (
            <SettingsRow
              key={post.id}
              icon="file-text"
              label={post.title || "Untitled"}
              detail={`${post.status} · ${formatDate(post.createdAt)}`}
              onPress={
                post.status === "published"
                  ? () => router.push(postPath({ id: post.id, slug: post.slug, author: { username } }))
                  : undefined
              }
            />
          ))}
        </SettingsSection>
      )}
      {detail.reports.length > 0 && (
        <SettingsSection title={`Reports (${detail.reports.length})`}>
          {detail.reports.map((report) => (
            <SettingsRow
              key={report.id}
              icon="flag"
              label={report.reason || "No reason given"}
              detail={`${report.status} · ${formatDate(report.createdAt)}`}
            />
          ))}
        </SettingsSection>
      )}
    </>
  );
}

export default function AdminUser() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const insets = useSafeAreaInsets();
  const { user: viewer } = useViewer();
  const query = useQuery({
    queryKey: queryKeys.adminUser(id),
    queryFn: () => api.adminUserDetail(id),
    meta: { persist: false },
  });

  const detail = query.data;
  if (!detail) {
    return (
      <Screen>
        <ScreenHeader />
        {query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <LoadingState />}
      </Screen>
    );
  }
  return (
    <Screen>
      <ScreenHeader title={`@${detail.user.username}`} />
      <ScrollView contentContainerClassName="gap-6 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <UserSummary detail={detail} />
        <ModerationActions detail={detail} />
        {viewer?.isAdmin && viewer.id !== detail.user.id && <RoleActions detail={detail} />}
        <RecentActivity detail={detail} />
      </ScrollView>
    </Screen>
  );
}
