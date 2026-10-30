import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useState, type RefObject } from "react";
import { Platform, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { useThemeColor } from "@/hooks/use-theme-colors";
import { formatScheduleLong, timeUntil, zoneLabel } from "@/lib/format";

// The server refuses a schedule in the past; a few minutes of slack covers the time spent choosing.
const MIN_LEAD_MS = 5 * 60_000;

const nextHour = () => {
  const date = new Date(Date.now() + 60 * 60_000);
  date.setMinutes(0, 0, 0);
  return date;
};

/** Publish now, schedule, or keep as a draft: the web composer's split Publish button. */
export function PublishSheet({
  sheetRef,
  scheduledAt,
  busy,
  onPublish,
  onSchedule,
  onDraft,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  scheduledAt: string | null;
  busy: boolean;
  onPublish: () => void;
  onSchedule: (at: Date) => void;
  onDraft: () => void;
}) {
  const accent = useThemeColor("--color-foreground");
  const [when, setWhen] = useState(() => (scheduledAt ? new Date(scheduledAt) : nextHour()));
  // Android shows date and time as separate dialogs; iOS shows them inline.
  const [picking, setPicking] = useState<"date" | "time" | null>(null);
  const [openedAt] = useState(Date.now);
  const [minimumDate] = useState(() => new Date());
  const tooSoon = when.getTime() < openedAt + MIN_LEAD_MS;

  return (
    <Sheet sheetRef={sheetRef} title={scheduledAt ? "Scheduled" : "Publish"}>
      <View className="gap-5 px-5">
        <Button variant="solid" icon="send" loading={busy} onPress={onPublish}>
          Publish now
        </Button>

        <View className="gap-3 rounded-card border border-border p-4">
          <Text weight="semibold">{scheduledAt ? "Reschedule" : "Schedule for later"}</Text>
          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={when}
              mode="datetime"
              display="compact"
              minimumDate={minimumDate}
              accentColor={accent}
              onValueChange={(_event, date) => setWhen(date)}
            />
          ) : (
            <View className="flex-row gap-2">
              <Button variant="outline" size="sm" icon="calendar" onPress={() => setPicking("date")}>
                {when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </Button>
              <Button variant="outline" size="sm" icon="clock" onPress={() => setPicking("time")}>
                {when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
              </Button>
              {picking && (
                <DateTimePicker
                  value={when}
                  mode={picking}
                  is24Hour
                  minimumDate={minimumDate}
                  accentColor={accent}
                  onValueChange={(_event, date) => {
                    setWhen(date);
                    setPicking(null);
                  }}
                  onDismiss={() => setPicking(null)}
                />
              )}
            </View>
          )}
          <Text size="xs" tone={tooSoon ? "destructive" : "muted"}>
            {tooSoon
              ? "Pick a time at least five minutes from now."
              : `${formatScheduleLong(when.toISOString())} (${zoneLabel()}), ${timeUntil(when.toISOString())}`}
          </Text>
          <Button variant="outline" icon="calendar-clock" disabled={tooSoon || busy} onPress={() => onSchedule(when)}>
            {scheduledAt ? "Reschedule" : "Schedule"}
          </Button>
        </View>

        <Button variant="ghost" icon="file-text" disabled={busy} onPress={onDraft}>
          {scheduledAt ? "Unschedule, keep as draft" : "Save as draft"}
        </Button>
      </View>
    </Sheet>
  );
}
