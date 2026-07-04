<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Dialog, Label, Switch } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { AdminInstance } from "$lib/types";

  // Runtime instance identity: app name + public domain + the federation toggle,
  // all editable after setup so an operator never returns to a config file. The
  // domain change and the federation toggle bind at boot, so both apply on the
  // next restart — surfaced inline. Admin-only (mounted from the admin page).
  let appName = $state("");
  let appDomain = $state("");
  // Desired federation state (what applies on restart) vs what's running now.
  let federationEnabled = $state(false);
  let federationRunning = $state(false);
  let sessionSecretManaged = $state(false);

  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);

  // Rotate-secret dialog state.
  let rotateOpen = $state(false);
  let rotating = $state(false);
  let rotated = $state(false);
  let rotateError = $state("");

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  // A saved federation choice that differs from what's mounted needs a restart.
  const federationRestartPending = $derived(federationEnabled !== federationRunning);

  function apply(s: AdminInstance) {
    appName = s.appName;
    // The bare localhost dev default isn't a real public domain — show it blank.
    appDomain = s.appDomain.startsWith("localhost") ? "" : s.appDomain;
    federationEnabled = s.federationEnabled;
    federationRunning = s.federationRunning;
    sessionSecretManaged = s.sessionSecretManaged;
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
          federationEnabled,
        }),
      );
      saved = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }

  async function rotate() {
    rotating = true;
    rotateError = "";
    try {
      await endpoints().rotateSessionSecret();
      rotated = true;
      rotateOpen = false;
    } catch (e) {
      rotateError = e instanceof ApiError ? e.message : "Could not rotate the secret.";
    } finally {
      rotating = false;
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
    class="flex items-start justify-between gap-3 rounded-card border border-border bg-background-alt px-3.5 py-3"
  >
    <div class="flex flex-col gap-0.5">
      <Label.Root for="admin-federation" class={labelClass}>Federation (ActivityPub)</Label.Root>
      <p class="text-xs text-muted-foreground">
        Publish and receive posts across the fediverse. Turning this off runs the instance as a
        standalone blog. Applies on the next restart.
        {#if federationRestartPending}
          <span class="text-foreground"
            >Saved as {federationEnabled ? "on" : "off"} — restart to apply (currently {federationRunning
              ? "on"
              : "off"}).</span
          >
        {/if}
      </p>
    </div>
    <Switch.Root
      id="admin-federation"
      bind:checked={federationEnabled}
      disabled={loading || saving}
      class="peer inline-flex h-[28px] min-h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
    >
      <Switch.Thumb
        class="pointer-events-none block size-[22px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
      />
    </Switch.Root>
  </div>

  <div class="flex items-center gap-3">
    <Button type="button" variant="solid" class="h-11" disabled={loading || saving} onclick={save}>
      {saving ? "Saving…" : "Save changes"}
    </Button>
    {#if saved}<span class="text-sm text-muted-foreground">Saved.</span>{/if}
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  <!-- Session secret rotation: deliberate, restart-applied, signs everyone out. -->
  <div class="mt-2 flex flex-col gap-2 rounded-card border border-border bg-background-alt px-3.5 py-3">
    <span class={labelClass}>Session secret</span>
    {#if sessionSecretManaged}
      <p class="text-xs text-muted-foreground">
        Rotating the secret invalidates every signed-in session. It takes effect on the next
        restart, so everyone (including you) is signed out then. Only do this if you suspect the
        secret was exposed.
      </p>
      {#if rotated}
        <p class="text-sm text-foreground">
          A new secret is staged. Restart the instance to apply it — all sessions end at that point.
        </p>
      {:else}
        <Dialog.Root bind:open={rotateOpen}>
          <Dialog.Trigger>
            {#snippet child({ props })}
              <Button {...props} type="button" variant="outline" size="sm" class="self-start">
                Rotate session secret
              </Button>
            {/snippet}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay
              class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            />
            <Dialog.Content
              class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border sm:max-w-[440px]"
            >
              <div class="flex items-center justify-between border-b border-border px-5 py-4">
                <Dialog.Title class="text-foreground text-base font-semibold tracking-tight">
                  Rotate session secret?
                </Dialog.Title>
                <Dialog.Close class="text-muted-foreground hover:text-foreground focus-visible:outline-none" aria-label="Close">
                  <Icon name="close" size={18} />
                </Dialog.Close>
              </div>
              <div class="flex flex-col gap-4 px-5 py-5">
                <p class="text-sm text-muted-foreground">
                  This stages a new secret. On the next restart every session ends and everyone —
                  you included — is signed out. It cannot be undone.
                </p>
                {#if rotateError}<p class="text-sm text-destructive">{rotateError}</p>{/if}
                <div class="flex justify-end gap-2">
                  <Dialog.Close>
                    {#snippet child({ props })}
                      <Button {...props} type="button" variant="outline" size="sm">Cancel</Button>
                    {/snippet}
                  </Dialog.Close>
                  <Button
                    type="button"
                    variant="solid"
                    size="sm"
                    disabled={rotating}
                    onclick={rotate}
                  >
                    {rotating ? "Rotating…" : "Rotate secret"}
                  </Button>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      {/if}
    {:else}
      <p class="text-xs text-muted-foreground">
        The session secret is pinned via the <code class="text-foreground">SESSION_SECRET</code>
        environment variable. Rotate it where it's set, then restart.
      </p>
    {/if}
  </div>
</div>
