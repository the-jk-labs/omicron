import * as Application from "expo-application";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInstance } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Icon } from "@/components/ui/icon";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import { useSignOut, useViewer } from "@/lib/auth/session";
import { confirm } from "@/lib/dialogs/confirm";
import { hostOf } from "@/lib/instance/origin";
import { clearInstance } from "@/lib/instance/store";
import { queryKeys } from "@/lib/query/keys";

// Refetched each time the screen opens, behind the cached values it shows at once.
const REFRESH = [queryKeys.me];

export default function Settings() {
  useRefreshOnFocus(REFRESH);
  const { origin, name } = useInstance();
  const { user } = useViewer();
  const signOut = useSignOut();
  const insets = useSafeAreaInsets();

  const changeInstance = async () => {
    if (
      !(await confirm({
        title: "Change instance?",
        description: user ? `You'll be signed out of ${name}.` : undefined,
        confirmText: "Change instance",
      }))
    )
      return;
    if (user) await signOut();
    // The root layout swaps back to the instance picker.
    clearInstance();
  };

  return (
    <Screen>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerClassName="gap-6 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {user && (
          <SettingsSection title="Account">
            <SettingsRow
              icon="user"
              label="Profile"
              detail="Photo, name, bio and links"
              onPress={() => router.push("/settings/profile")}
            />
            <SettingsRow
              icon="key-round"
              label="Account"
              detail="Email, password, sessions"
              onPress={() => router.push("/settings/account")}
            />
            <SettingsRow
              icon="lock"
              label="Privacy"
              detail="Private account, muted and blocked"
              onPress={() => router.push("/settings/privacy")}
            />
            <SettingsRow
              icon="plug"
              label="Integrations"
              detail="Publishing tokens, connected apps"
              onPress={() => router.push("/settings/integrations")}
            />
          </SettingsSection>
        )}
        <SettingsSection title="App">
          <SettingsRow
            icon="sliders-horizontal"
            label="Preferences"
            detail="Theme, feeds and languages"
            onPress={() => router.push("/settings/preferences")}
          />
        </SettingsSection>
        <SettingsSection title={name}>
          <SettingsRow icon="info" label="About" onPress={() => router.push("/instance/about")} />
          <SettingsRow icon="gavel" label="Rules" onPress={() => router.push("/instance/rules")} />
          <SettingsRow icon="shield-check" label="Privacy policy" onPress={() => router.push("/instance/privacy")} />
          <SettingsRow
            icon="globe"
            label="Open on the web"
            detail={hostOf(origin)}
            onPress={() => void WebBrowser.openBrowserAsync(origin)}
          />
          <SettingsRow icon="arrow-left-right" label="Change instance" onPress={() => void changeInstance()} />
        </SettingsSection>
        {user && (
          <SettingsSection>
            <SettingsRow
              icon="log-out"
              label="Sign out"
              destructive
              onPress={async () => {
                if (await confirm({ title: "Sign out?", confirmText: "Sign out" })) {
                  await signOut();
                  router.dismissTo("/");
                }
              }}
            />
          </SettingsSection>
        )}
        <SettingsSection
          footer={`Omicron ${Application.nativeApplicationVersion ?? ""} (${Application.nativeBuildVersion ?? ""})`}
        >
          <SettingsRow
            icon="scale"
            label="Licence"
            detail="Free and open source, GNU AGPL"
            onPress={() => router.push("/settings/licence")}
          />
          <SettingsRow
            icon="code"
            label="Source code"
            detail="On GitHub, for developers"
            trailing={<Icon name="external-link" size={16} className="text-muted-foreground" />}
            onPress={() => void WebBrowser.openBrowserAsync("https://github.com/the-jk-labs/omicron")}
          />
        </SettingsSection>
      </ScrollView>
    </Screen>
  );
}
