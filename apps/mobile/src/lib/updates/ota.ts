import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { toast } from "@/lib/dialogs/toast";

const RECHECK_MS = 30 * 60 * 1000;
const SWIPE_DISTANCE = 40;
const SWIPE_VELOCITY = 500;

/** A phone can keep the app open for days, so coming back to it checks again, but not on every switch. */
export function isCheckDue(lastCheck: Date | undefined, now: number) {
  return !lastCheck || now - lastCheck.getTime() >= RECHECK_MS;
}

/** An upward swipe that went far enough, or was flicked fast enough, dismisses. */
export function shouldDismissSwipe(translationY: number, velocityY: number) {
  "worklet";
  return translationY <= -SWIPE_DISTANCE || velocityY <= -SWIPE_VELOCITY;
}

export async function downloadLatestUpdate() {
  try {
    const { isAvailable, isRollBackToEmbedded } = await Updates.checkForUpdateAsync();
    if (isAvailable || isRollBackToEmbedded) await Updates.fetchUpdateAsync();
  } catch (error) {
    // Offline or the server is away: the next launch or return tries again, and nothing here needs the person.
    console.warn("[ota] Update check failed:", error);
  }
}

/** Whether a downloaded update waits for a restart. The native launch check downloads it; `useUpdates` reports that. */
export function useOtaUpdate() {
  const {
    isUpdatePending,
    downloadedUpdate,
    isChecking,
    isDownloading,
    isStartupProcedureRunning,
    lastCheckForUpdateTimeSinceRestart: lastCheck,
  } = Updates.useUpdates();
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const busy = isChecking || isDownloading || isStartupProcedureRunning;

  useEffect(() => {
    if (!Updates.isEnabled) return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !busy && isCheckDue(lastCheck, Date.now())) void downloadLatestUpdate();
    });
    return () => subscription.remove();
  }, [busy, lastCheck]);

  // Keyed by update, so dismissing one doesn't hide a newer one downloaded later. A rollback has no id.
  const pendingId = isUpdatePending ? (downloadedUpdate?.updateId ?? "rollback") : null;

  return {
    visible: pendingId !== null && pendingId !== dismissedId,
    restarting,
    dismiss: () => setDismissedId(pendingId),
    restart: () => {
      setRestarting(true);
      Updates.reloadAsync().catch(() => {
        setRestarting(false);
        toast("Couldn't restart. Close and reopen the app to update.", "error");
      });
    },
  };
}
