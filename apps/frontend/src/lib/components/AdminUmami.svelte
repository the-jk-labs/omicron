<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { untrack } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Button from "#lib/components/ui/Button.svelte";
  import type { UmamiSettings } from "#lib/types.js";

  let { initial = null }: { initial?: UmamiSettings | null } = $props();
  const seed = untrack(() => initial);
  let enabled = $state(seed?.enabled ?? false);
  let websiteId = $state(seed?.websiteId ?? "");
  let loading = $state(!seed);
  let saving = $state(false);
  let error = $state("");
  let saved = $state("");
  let loadFailed = $state(false);

  $effect(() => {
    if (seed) return;
    endpoints()
      .adminUmami()
      .then((settings) => {
        enabled = settings.enabled;
        websiteId = settings.websiteId;
        return settings;
      })
      .catch((e) => {
        loadFailed = true;
        error = e instanceof ApiError ? e.message : "Failed to load settings.";
      })
      .finally(() => {
        loading = false;
      });
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    error = "";
    saved = "";
    try {
      const settings = await endpoints().setAdminUmami({ enabled, websiteId });
      enabled = settings.enabled;
      websiteId = settings.websiteId;
      saved = enabled ? "Umami Cloud enabled." : "Umami Cloud disabled.";
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to save settings.";
    } finally {
      saving = false;
    }
  }
</script>

<form onsubmit={save} class="flex flex-col gap-4">
  <p class="max-w-prose text-sm text-muted-foreground">
    Add your website in <a
      href="https://cloud.umami.is"
      target="_blank"
      rel="noopener noreferrer"
      class="text-foreground underline">Umami Cloud</a
    >, then paste its website ID or tracking code below. Only the ID is saved; pasted code is never executed. Both the
    script and pageviews use this instance's domain, following
    <a
      href="https://docs.umami.is/docs/bypass-ad-blockers"
      target="_blank"
      rel="noopener noreferrer"
      class="text-foreground underline">Umami's proxy guidance</a
    >. No server configuration or restart is needed.
  </p>
  <p class="max-w-prose text-sm text-muted-foreground">
    Optional and off by default. Public reading pages only; no account IDs, custom events, query strings or fragments.
    DNT and GPC are honoured. When enabled, visitor IP addresses and browser information are forwarded to Umami Cloud.
    Update your <a href="/privacy" class="text-foreground underline">privacy policy</a> and obtain any consent required in
    your jurisdiction before enabling. This is separate from writers' built-in view counts.
  </p>
  {#if loading}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else}
    <div class="flex items-center gap-3">
      <Switch.Root
        id="umami-enabled"
        bind:checked={enabled}
        disabled={saving || loadFailed}
        class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset dark:data-[state=checked]:bg-foreground"
      >
        <Switch.Thumb
          class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-6 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini dark:border dark:border-background/30 dark:bg-foreground dark:shadow-popover dark:data-[state=unchecked]:border"
        />
      </Switch.Root>
      <Label.Root for="umami-enabled" class="text-sm font-medium">Enable Umami Cloud</Label.Root>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="umami-website" class="text-sm leading-none font-medium text-foreground"
        >Website ID or tracking code</Label.Root
      >
      <textarea
        id="umami-website"
        bind:value={websiteId}
        disabled={saving || loadFailed}
        rows="3"
        maxlength="4096"
        spellcheck="false"
        autocomplete="off"
        placeholder="94db1cb1-74f4-4a40-ad6c-962362670409"
        aria-describedby="umami-help"
        class="rounded-input border border-input bg-background px-3.5 py-3 text-sm shadow-btn outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground"
      ></textarea>
      <p id="umami-help" class="text-sm text-muted-foreground">
        Disable to stop collection while keeping the ID. Clear the field and save while disabled to remove it.
      </p>
    </div>
    <div>
      <Button type="submit" variant="solid" size="sm" disabled={saving || loadFailed || (enabled && !websiteId.trim())}
        >{saving ? "Saving…" : "Save Umami settings"}</Button
      >
    </div>
  {/if}
  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
  {#if saved}<p role="status" class="text-sm text-muted-foreground">{saved}</p>{/if}
</form>
