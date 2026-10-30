import { View } from "react-native";
import { ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/errors";
import { useIsOffline } from "@/lib/network/use-device-network";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { Spinner } from "./spinner";
import { Text } from "./text";

export function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="items-center gap-3 px-8 py-16">
      <View className="size-12 items-center justify-center rounded-full bg-muted">
        <Icon name={icon} size={22} className="text-muted-foreground" />
      </View>
      <Text weight="semibold" className="text-center">
        {title}
      </Text>
      {description && (
        <Text size="sm" tone="muted" className="text-center">
          {description}
        </Text>
      )}
      {action && (
        <Button variant="outline" size="sm" onPress={action.onPress}>
          {action.label}
        </Button>
      )}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <EmptyState
      icon={notFound ? "search" : "triangle-alert"}
      title={notFound ? "Not found" : "Couldn't load this"}
      description={notFound ? "It may have been removed, or you don't have access." : errorMessage(error)}
      action={onRetry && !notFound ? { label: "Try again", onPress: onRetry } : undefined}
    />
  );
}

/** Shown instead of a spinner while requests are paused, since nothing would ever arrive. */
export function OfflineState() {
  return (
    <EmptyState
      icon="wifi-off"
      title="You're offline"
      description="This hasn't been saved on your device yet. It loads when you're back online."
    />
  );
}

export function LoadingState() {
  const offline = useIsOffline();
  if (offline) return <OfflineState />;
  return (
    <View className="flex-1 items-center justify-center py-16">
      <Spinner size="large" />
    </View>
  );
}

/** List footer: a spinner while the next page loads, or a retry when it failed. */
export function ListFooter({ loading, error, onRetry }: { loading: boolean; error?: unknown; onRetry?: () => void }) {
  if (loading) {
    return (
      <View className="py-6">
        <Spinner />
      </View>
    );
  }
  if (error) {
    return (
      <View className="items-center gap-2 py-6">
        <Text size="sm" tone="muted">
          {errorMessage(error)}
        </Text>
        {onRetry && (
          <Button size="xs" variant="outline" onPress={onRetry}>
            Try again
          </Button>
        )}
      </View>
    );
  }
  return <View className="h-8" />;
}
