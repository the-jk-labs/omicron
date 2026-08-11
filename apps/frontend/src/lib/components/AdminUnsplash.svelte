<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import { Label } from "bits-ui";

  // The Unsplash access key, which adds Unsplash as a second source in the
  // editor's banner picker. Optional, and optional by necessity: Unsplash
  // issues a key per registered application and has no anonymous mode, so
  // unlike Openverse it cannot work out of the box. The picker is useful
  // without it.
  //
  // The key is write-only over the API — the server reports whether one is set
  // and nothing more, so it can't come back through a browser cache or land in
  // a screenshot of this page. Re-entering it is the way to change it.
  let configured = $state(false);
  let accessKey = $state("");
  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saved = $state("");

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";

  $effect(() => {
    endpoints()
      .adminUnsplash()
      .then((r) => (configured = r.configured))
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  async function save(key: string | null) {
    saving = true;
    error = "";
    saved = "";
    try {
      configured = (await endpoints().setAdminUnsplash(key)).configured;
      accessKey = "";
      saved = key ? "Unsplash added to the banner picker." : "Unsplash removed. Openverse is still available.";
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <p class="max-w-prose text-sm text-muted-foreground">
    Photo search already works with no setup: the banner picker searches
    <strong class="text-foreground">Openverse</strong>, which needs no account. Adding a key here puts
    <strong class="text-foreground">Unsplash</strong>
    beside it as a second tab. Either way the creator is credited under the banner automatically, as both providers' terms
    require. Create a free app at
    <a
      href="https://unsplash.com/oauth/applications"
      target="_blank"
      rel="noopener noreferrer"
      class="text-foreground underline">unsplash.com/oauth/applications</a
    >
    and paste its <em>Access Key</em> below. Their demo tier allows 50 searches an hour across the whole instance.
  </p>

  {#if loading}
    <p class="text-sm text-muted-foreground">Loading…</p>
  {:else}
    <p class="text-sm text-foreground">
      Status:
      <span class={configured ? "text-foreground" : "text-muted-foreground"}>
        {configured
          ? "configured — writers see an Unsplash tab in the picker"
          : "not configured — the picker searches Openverse only"}
      </span>
    </p>

    <div class="flex flex-col gap-1.5">
      <Label.Root for="unsplash-key" class="text-sm font-medium leading-none text-foreground">Access key</Label.Root>
      <input
        id="unsplash-key"
        bind:value={accessKey}
        type="password"
        autocomplete="off"
        placeholder={configured ? "Enter a new key to replace the current one" : "Your Unsplash Access Key"}
        class={field}
      />
    </div>

    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    {#if saved}<p class="text-sm text-muted-foreground">{saved}</p>{/if}

    <div class="flex items-center gap-2">
      <Button variant="solid" size="sm" disabled={saving || !accessKey.trim()} onclick={() => save(accessKey.trim())}>
        {saving ? "Saving…" : "Save key"}
      </Button>
      {#if configured}
        <Button variant="outline" size="sm" disabled={saving} onclick={() => save(null)}>Remove key</Button>
      {/if}
    </div>
  {/if}
</div>
