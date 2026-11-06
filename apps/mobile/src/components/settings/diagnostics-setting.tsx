import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Switch } from "@/components/ui/switch";
import { useShareDiagnostics } from "@/lib/observe";

export function DiagnosticsSetting() {
  const [enabled, setEnabled] = useShareDiagnostics();
  return (
    <SettingsSection footer="Sends load times and error reports to Expo to help fix problems. Which posts and profiles you open is left out. Saved on this device only, so reinstalling the app turns this back on.">
      <SettingsRow
        icon="activity"
        label="Share diagnostics"
        trailing={<Switch checked={enabled} onCheckedChange={setEnabled} label="Share diagnostics" />}
      />
    </SettingsSection>
  );
}
