import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { InstanceProvider } from "@/components/instance-provider";
import { ConnectivityBanner } from "@/components/layout/connectivity-banner";
import { ScreenError } from "@/components/layout/screen-error";
import { useStackOptions } from "@/components/layout/stack-options";
import { UpdateBanner } from "@/components/layout/update-banner";
import { SaveToListHost } from "@/components/lists/save-to-list";
import { PostMenuHost } from "@/components/post/post-menu";
import { ConfirmHost } from "@/components/ui/confirm";
import { ToastHost } from "@/components/ui/toast";
import { pendingLink, resolveIncomingLink } from "@/lib/instance/app-links";
import { useSavedInstance } from "@/lib/instance/store";

export default function AppLayout() {
  const instance = useSavedInstance();
  const stackOptions = useStackOptions();
  const origin = instance?.origin;

  // A link that arrived before an instance was chosen opens now, if it belongs to the one chosen.
  useEffect(() => {
    const link = pendingLink.get();
    if (!link || !origin) return;
    pendingLink.set(null);
    const target = resolveIncomingLink(link, origin);
    if (target.kind === "app") router.push(target.path);
  }, [origin]);

  // The root layout only mounts this group once an instance is saved.
  if (!instance) return null;

  return (
    // A new origin remounts everything below: auth, API and caches all belong to one instance.
    <InstanceProvider key={instance.origin} instance={instance}>
      <BottomSheetModalProvider>
        {/* A screen that throws is replaced by ScreenError on its own; tabs and other screens carry on. */}
        <Stack screenOptions={stackOptions} unstable_screenErrorBoundary={ScreenError}>
          <Stack.Screen name="(tabs)" />
          {/* Writing and signing in are tasks laid over the app: they rise from the bottom. */}
          <Stack.Screen name="compose" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="(auth)" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          {/* Search opens in place over the current screen, as in X. */}
          <Stack.Screen name="search" options={{ animation: "fade", animationDuration: 180 }} />
          {/* Only forwards to the post canonical address, so it should not animate at all. */}
          <Stack.Screen name="posts/[id]" options={{ animation: "none" }} />
          {/* Alerts open from Home's header, over the tabs. */}
          <Stack.Screen name="notifications" />
        </Stack>
        <UpdateBanner />
        <ConnectivityBanner />
        <SaveToListHost />
        <PostMenuHost />
        <ConfirmHost />
        <ToastHost />
      </BottomSheetModalProvider>
    </InstanceProvider>
  );
}
