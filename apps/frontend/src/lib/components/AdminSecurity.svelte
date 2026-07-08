<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";

  // Moderator-only security controls. Currently the AI-scraper shield (Anubis):
  // a proof-of-work challenge shown to browser-like traffic on page loads.
  // Applied live via Caddy — no restart — and never in front of federation or
  // the API. `managed` is false where the reverse proxy can't be driven from
  // here (e.g. a bare dev run); then the switch is disabled with an explanation.
  let enabled = $state(false);
  let managed = $state(true);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");

  $effect(() => {
    endpoints()
      .adminSecurity()
      .then((s) => {
        enabled = s.anubisProtection;
        managed = s.anubisManaged;
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

<div class="flex items-start justify-between gap-4">
  <div class="flex flex-col gap-1">
    <Label.Root for="anubis-protection" class="text-sm font-medium text-foreground">
      AI-scraper protection
    </Label.Root>
    <p class="max-w-prose text-sm text-muted-foreground">
      Show a lightweight proof-of-work challenge to browser-like traffic on page loads, to slow
      down AI crawlers that hammer the instance. Real readers pass it in about a second; federation
      and the API are never challenged. Applies instantly — no restart. Leave off unless you're
      seeing scraper load: it adds a brief interstitial for everyone, including no-JS readers.
    </p>
    {#if !managed}
      <p class="mt-1 max-w-prose text-sm text-foreground">
        Not available in this environment — the bundled reverse proxy isn't under management here,
        so there's nothing to route through the challenge.
      </p>
    {/if}
  </div>

  <Switch.Root
    id="anubis-protection"
    checked={enabled}
    disabled={loading || saving || !managed}
    onCheckedChange={toggle}
    class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
  >
    <Switch.Thumb
      class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
    />
  </Switch.Root>
</div>

{#if error}<p class="mt-3 text-sm text-destructive">{error}</p>{/if}
