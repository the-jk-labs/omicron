<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { AdminInstance } from "$lib/types";

  // Runtime instance identity: app name + public domain, editable after setup so
  // an operator never returns to a config file. Federation is boot/env-bound, so
  // it's shown read-only here. Admin-only (mounted from the admin page).
  let appName = $state("");
  let appDomain = $state("");
  let federationEnabled = $state(false);

  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  function apply(s: AdminInstance) {
    appName = s.appName;
    // The bare localhost dev default isn't a real public domain — show it blank.
    appDomain = s.appDomain.startsWith("localhost") ? "" : s.appDomain;
    federationEnabled = s.federationEnabled;
  }

  $effect(() => {
    endpoints()
      .adminInstance()
      .then(apply)
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  async function save() {
    saving = true;
    error = "";
    saved = false;
    try {
      apply(
        await endpoints().setAdminInstance({
          appName: appName.trim(),
          appDomain: appDomain.trim(),
        }),
      );
      saved = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-col gap-1.5">
    <Label.Root for="admin-appName" class={labelClass}>Instance name</Label.Root>
    <input
      id="admin-appName"
      bind:value={appName}
      disabled={loading}
      placeholder="My Blog"
      class={field}
    />
    <p class="text-xs text-muted-foreground">The name shown across the site.</p>
  </div>

  <div class="flex flex-col gap-1.5">
    <Label.Root for="admin-appDomain" class={labelClass}>Public domain</Label.Root>
    <input
      id="admin-appDomain"
      bind:value={appDomain}
      disabled={loading}
      placeholder="blog.example.com"
      class={field}
    />
    <p class="text-xs text-muted-foreground">
      Used for links in email and share cards. A change applies to app URLs at once, but reaches
      ActivityPub only after a restart (federation identity binds at boot).
    </p>
  </div>

  <div
    class="flex items-center gap-2 rounded-card border border-border bg-background-alt px-3.5 py-2.5 text-sm"
  >
    <Icon name="globe" size={16} />
    <span class="text-foreground">Federation</span>
    <span class="text-muted-foreground">
      {federationEnabled ? "enabled" : "disabled"} · set with FEDERATION_ENABLED, applied on restart
    </span>
  </div>

  <div class="flex items-center gap-3">
    <Button type="button" variant="solid" class="h-11" disabled={loading || saving} onclick={save}>
      {saving ? "Saving…" : "Save changes"}
    </Button>
    {#if saved}<span class="text-sm text-muted-foreground">Saved.</span>{/if}
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
</div>
