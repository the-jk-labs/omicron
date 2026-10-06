<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Asks for the password when Better Auth wants a sign-in from the last day.
     Confirming starts a fresh session, which every section shares. -->
<script lang="ts">
  import { Dialog, Label } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import UsernameHint from "#lib/components/UsernameHint.svelte";
  import { confirmPassword } from "#lib/passkeys.js";

  let {
    open = $bindable(false),
    username,
    description,
    onconfirmed,
  }: { open?: boolean; username: string; description: string; onconfirmed?: () => void } = $props();

  let password = $state("");
  let error = $state("");
  let checking = $state(false);

  function onOpenChange(next: boolean) {
    open = next;
    if (!next) password = error = "";
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!password || checking) return;
    error = "";
    checking = true;
    const failed = await confirmPassword(username, password);
    checking = false;
    if (failed) {
      error = failed;
      return;
    }
    onOpenChange(false);
    onconfirmed?.();
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <form onsubmit={submit}>
        <UsernameHint {username} />
        <div class="flex items-center gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
            <Icon name="lock" size={18} />
          </span>
          <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Confirm it's you</Dialog.Title>
        </div>
        <Dialog.Description class="mt-3 text-sm text-foreground-alt">{description}</Dialog.Description>

        <div class="mt-4 flex flex-col gap-1.5">
          <Label.Root for="confirm-password" class="text-sm leading-none font-medium text-foreground"
            >Password</Label.Root
          >
          <input
            id="confirm-password"
            type="password"
            name="password"
            bind:value={password}
            autocomplete="current-password"
            class="h-11 rounded-input border border-input bg-background px-3.5 text-sm shadow-btn outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground"
          />
        </div>

        {#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}

        <div class="mt-6 flex justify-end gap-2">
          <Dialog.Close
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <Button type="submit" variant="solid" class="h-10 px-5" disabled={checking || !password}>
            {checking ? "Checking…" : "Continue"}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
