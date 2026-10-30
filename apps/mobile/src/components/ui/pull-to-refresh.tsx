import { useState } from "react";
import { RefreshControl, type RefreshControlProps } from "react-native";

// Long enough for the spinner to finish its entrance, so a fast refresh doesn't snap it away.
const MIN_SPIN_MS = 600;

type PullToRefreshProps = Omit<RefreshControlProps, "refreshing" | "onRefresh"> & {
  onRefresh: () => Promise<unknown>;
  /** A background refetch that will replace what's on screen (the cached feed at launch), shown as a pull would be. */
  syncing?: boolean;
};

/**
 * A themed pull-to-refresh control for a list's `refreshControl`. It spins for the person's own pull, never shorter
 * than the spinner's entrance, and for `syncing`.
 */
export function PullToRefresh({ onRefresh, syncing = false, ...props }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    const minimum = new Promise((resolve) => setTimeout(resolve, MIN_SPIN_MS));
    void Promise.all([onRefresh().catch(() => undefined), minimum]).then(() => setRefreshing(false));
  };
  return (
    <RefreshControl
      {...props}
      refreshing={refreshing || syncing}
      onRefresh={refresh}
      colorsClassName="accent-foreground"
      tintColorClassName="accent-muted-foreground"
      progressBackgroundColorClassName="accent-background-alt"
    />
  );
}
