<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The reader's two-factor sign-in: turn it on with an authenticator app, make
     new backup codes, or turn it off. Moderators and admins get no backup codes,
     and may not turn it off while the instance requires it of them. -->
<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { Dialog, Label } from "bits-ui";
  import type { Snippet } from "svelte";
  import { authClient } from "#lib/auth-client.js";
  import Icon from "#lib/components/Icon.svelte";
  import TwoFactorSetup from "#lib/components/TwoFactorSetup.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import UsernameHint from "#lib/components/UsernameHint.svelte";
  import { twoFactorError } from "#lib/twoFactor.js";

  let {
    username,
    enabled,
    staff,
    required,
    header,
  }: { username: string; enabled: boolean; staff: boolean; required: boolean; header?: Snippet } = $props();

  let setupOpen = $state(false);
  // Turning off and new backup codes both re-check the password first.
  let action = $state<"disable" | "codes" | null>(null);
  let password = $state("");
  let codes = $state<string[]>([]);
  let error = $state("");
  let busy = $state(false);

  const field =
    "h-11 w-full rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const dialogClass =
    "fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]";
  const overlayClass =
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50";

  function openAction(next: "disable" | "codes") {
    action = next;
    password = "";
    codes = [];
    error = "";
  }

  async function setUp() {
    setupOpen = false;
    await invalidateAll();
  }

  async function runAction(e: SubmitEvent) {
    e.preventDefault();
    if (!password || busy) return;
    busy = true;
    error = "";
    try {
      if (action === "disable") {
        const res = await authClient.twoFactor.disable({ password });
        if (res.error) {
          error = twoFactorError(res.error);
          return;
        }
        action = null;
        await invalidateAll();
      } else {
        const res = await authClient.twoFactor.generateBackupCodes({ password });
        if (res.error) {
          error = twoFactorError(res.error);
          return;
        }
        codes = res.data.backupCodes;
        password = "";
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
  <div class="min-w-0">
    {@render header?.()}
    <p class="mt-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
      <Icon name={enabled ? "admin" : "shieldOff"} size={15} />
      {enabled ? "On: a password sign-in also asks for a code from your app." : "Off"}
    </p>
    {#if required && !enabled}
      <p class="mt-1 text-sm text-muted-foreground">Required to use moderation tools on this instance.</p>
    {:else if required}
      <p class="mt-1 text-sm text-muted-foreground">
        Moderators and admins must keep it on. If you lose your phone, ask an admin to reset it.
      </p>
    {/if}
  </div>
  <div class="flex shrink-0 flex-wrap gap-2 self-start">
    {#if !enabled}
      <Button variant="outline" size="sm" onclick={() => (setupOpen = true)}>
        <Icon name="phone" size={15} /> Set up
      </Button>
    {:else}
      {#if !staff}
        <Button variant="outline" size="sm" onclick={() => openAction("codes")}>New backup codes</Button>
      {/if}
      {#if !required}
        <Button variant="outline" size="sm" onclick={() => openAction("disable")}>Turn off</Button>
      {/if}
    {/if}
  </div>
</div>

<Dialog.Root bind:open={setupOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class={overlayClass} />
    <Dialog.Content class={dialogClass}>
      <div class="mb-3 flex items-start justify-between gap-4">
        <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
          Set up two-factor authentication
        </Dialog.Title>
        <Dialog.Close class="text-muted-foreground hover:text-foreground" aria-label="Close">
          <Icon name="close" size={18} />
        </Dialog.Close>
      </div>
      {#if setupOpen}
        <TwoFactorSetup {username} {staff} ondone={setUp}>
          {#snippet actions()}
            <Dialog.Close
              type="button"
              class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
            >
              Cancel
            </Dialog.Close>
          {/snippet}
        </TwoFactorSetup>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<Dialog.Root open={action !== null} onOpenChange={(next) => !next && (action = null)}>
  <Dialog.Portal>
    <Dialog.Overlay class={overlayClass} />
    <Dialog.Content class={dialogClass}>
      <form onsubmit={runAction}>
        <UsernameHint {username} />
        <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">
          {action === "disable" ? "Turn off two-factor authentication?" : "New backup codes"}
        </Dialog.Title>
        {#if codes.length}
          <Dialog.Description class="mt-1 text-sm text-muted-foreground">
            Your old backup codes no longer work. Save these somewhere safe; they won't be shown again.
          </Dialog.Description>
          <ul
            class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-card border border-border bg-background-alt p-4 font-mono text-sm text-foreground"
            aria-label="Backup codes"
          >
            {#each codes as backupCode (backupCode)}<li>{backupCode}</li>{/each}
          </ul>
        {:else}
          <Dialog.Description class="mt-1 text-sm text-muted-foreground">
            {action === "disable"
              ? "Signing in will take only your password again. Enter it to confirm."
              : "This replaces your current backup codes. Enter your password to confirm."}
          </Dialog.Description>
          <div class="mt-4 flex flex-col gap-1.5">
            <Label.Root for="two-factor-confirm-password" class="text-sm leading-none font-medium text-foreground">
              Password
            </Label.Root>
            <input
              id="two-factor-confirm-password"
              type="password"
              name="password"
              bind:value={password}
              autocomplete="current-password"
              class={field}
            />
          </div>
        {/if}
        {#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}
        <div class="mt-6 flex justify-end gap-2">
          {#if codes.length}
            <Button type="button" variant="solid" class="px-5" onclick={() => (action = null)}>Done</Button>
          {:else}
            <Dialog.Close
              type="button"
              class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
            >
              Cancel
            </Dialog.Close>
            <Button
              type="submit"
              variant={action === "disable" ? "destructive" : "solid"}
              class="px-5"
              disabled={!password || busy}
            >
              {busy ? "Checking…" : action === "disable" ? "Turn off" : "Make new codes"}
            </Button>
          {/if}
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
