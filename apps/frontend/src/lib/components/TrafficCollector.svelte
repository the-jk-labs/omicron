<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy } from "svelte";
  import { createTrafficReporter, type TrafficNavigation } from "#lib/traffic.js";

  let { enabled, staff }: { enabled: boolean; staff: boolean } = $props();
  const report = createTrafficReporter();
  let waiting: (() => void) | undefined;
  onDestroy(() => waiting?.());

  afterNavigate(({ from, to }) => {
    waiting?.();
    if (!to) return;
    const navigation: TrafficNavigation = {
      enabled,
      staff,
      status: page.status,
      // Initial hydration may omit the navigation route ID; page state already has it.
      routeId: to.route.id ?? page.route.id,
      url: to.url,
      from: from?.url ?? null,
      referrer: document.referrer,
      optedOut:
        navigator.doNotTrack === "1" ||
        (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true,
    };
    const send = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", send);
      waiting = undefined;
      void report(navigation);
    };
    if (document.visibilityState === "visible") send();
    else {
      document.addEventListener("visibilitychange", send);
      waiting = () => document.removeEventListener("visibilitychange", send);
    }
  });
</script>
