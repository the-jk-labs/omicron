import type { ErrorBoundaryProps } from "expo-router";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { EmptyState } from "@/components/ui/states";

/** Stands in for a screen that threw while rendering; the rest of the app keeps working around it. */
export function ScreenError({ retry }: ErrorBoundaryProps) {
  return (
    <Screen>
      <ScreenHeader />
      <EmptyState
        icon="triangle-alert"
        title="Something went wrong"
        description="This screen couldn't be shown. Go back, or try again."
        action={{ label: "Try again", onPress: () => void retry() }}
      />
    </Screen>
  );
}
