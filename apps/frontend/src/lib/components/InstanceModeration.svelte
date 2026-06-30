<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";

  // Moderator-only instance settings. Loads the current state on mount and
  // persists each toggle immediately. Only rendered for admins (see settings).
  let enabled = $state(false);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");

  $effect(() => {
    endpoints()
      .adminSettings()
      .then((s) => (enabled = s.onInstanceViews))
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  async function toggle(next: boolean) {
    saving = true;
    error = "";
    const prev = enabled;
    enabled = next;
    try {
      const s = await endpoints().setAnalytics(next);
      enabled = s.onInstanceViews;
    } catch (e) {
      enabled = prev; // revert on failure
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex items-start justify-between gap-4">
  <div class="flex flex-col gap-1">
    <Label.Root for="analytics-views" class="text-sm font-medium text-foreground">
      On-instance view counting
    </Label.Root>
    <p class="max-w-prose text-sm text-muted-foreground">
      Count aggregate page views for posts read on this instance. No IPs, cookies, or
      identifiers are stored, and Do&nbsp;Not&nbsp;Track / GPC are honoured. Turn off to show
      writers only fediverse engagement.
    </p>
  </div>

  <Switch.Root
    id="analytics-views"
    checked={enabled}
    disabled={loading || saving}
    onCheckedChange={toggle}
    class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
  >
    <Switch.Thumb
      class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
    />
  </Switch.Root>
</div>

{#if error}<p class="mt-3 text-sm text-destructive">{error}</p>{/if}
