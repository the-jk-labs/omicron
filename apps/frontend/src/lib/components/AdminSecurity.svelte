<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import AdminAccessRules from "#lib/components/AdminAccessRules.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import type { SecuritySettings } from "#lib/types.js";

  // `initial` is the server-loaded state; without it the browser loads it.
  let { initial = null }: { initial?: SecuritySettings | null } = $props();
  const seed = untrack(() => initial);

  // Admin-only security controls. Currently the AI-scraper shield (Anubis):
  // a proof-of-work challenge shown to browser-like traffic on page loads.
  // Applied live via Caddy — no restart — and never in front of federation or
  // the API. `managed` is false where the reverse proxy can't be driven from
  // here (e.g. a bare dev run); then the switch is disabled with an explanation.
  let enabled = $state(false);
  let managed = $state(true);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");

  if (seed) {
    enabled = seed.anubisProtection;
    managed = seed.anubisManaged;
    loading = false;
  }
  $effect(() => {
    if (seed) return;
    endpoints()
      .adminSecurity()
      .then((s) => {
        enabled = s.anubisProtection;
        managed = s.anubisManaged;
        return undefined;
      })
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  async function toggle(next: boolean) {
    saving = true;
    error = "";
    const prev = enabled;
    enabled = next;
    try {
      const s = await endpoints().setAnubisProtection(next);
      enabled = s.anubisProtection;
      managed = s.anubisManaged;
    } catch (e) {
      enabled = prev; // revert on failure
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }
</script>

<div
  class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-card border border-border bg-background-alt p-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:p-5"
>
  <div
    class="hidden size-11 shrink-0 place-items-center rounded-input border border-border bg-background text-foreground sm:grid"
  >
    <Icon name={enabled ? "admin" : "shieldOff"} size={20} />
  </div>
  <div class="min-w-0">
    <div class="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
      <Label.Root for="anubis-protection" class="text-sm font-medium text-foreground">AI-scraper protection</Label.Root>
      <span
        class="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >{loading
          ? "Loading…"
          : saving
            ? "Applying…"
            : !managed
              ? "Unavailable"
              : enabled
                ? "Enabled · Anubis"
                : "Disabled"}</span
      >
    </div>
    <p class="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
      A JavaScript challenge for sign-in, writing, search and account pages. Public reading, feeds and the API stay
      reachable. Enable when you're seeing automated abuse; this is not a site-wide scraping barrier.
    </p>
    {#if !managed}
      <p class="mt-2 max-w-prose text-sm leading-relaxed text-foreground">
        Not available in this environment. The bundled reverse proxy isn't under management here, so there's nothing to
        route through the challenge.
      </p>
    {/if}
  </div>

  <Switch.Root
    id="anubis-protection"
    checked={enabled}
    disabled={loading || saving || !managed}
    onCheckedChange={toggle}
    class="peer mt-0.5 inline-flex h-[28px] min-h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
  >
    <Switch.Thumb
      class="pointer-events-none block size-[22px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
    />
  </Switch.Root>
</div>

{#if error}<p class="mt-3 text-sm text-destructive">{error}</p>{/if}

<div class="mt-8">
  <AdminAccessRules managed={managed && !loading} />
</div>
