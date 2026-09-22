<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirmRequest } from "$lib/components/ui/confirm";
  import { AlertDialog, Checkbox } from "bits-ui";

  // Global host for the promise-based confirm() helper. Mounted once in the root
  // layout; renders the Bits UI AlertDialog whenever a request is pending and
  // resolves it with the user's choice.
  const req = $derived($confirmRequest);

  // Opt-in mail checkbox state. Reset for every request — opt-in means
  // unchecked unless the moderator checks it, every time.
  let notifyChecked = $state(false);
  $effect(() => {
    req;
    notifyChecked = false;
  });

  // Resolve the pending promise and clear the request. AlertDialog closes itself
  // when its open binding flips to false.
  function answer(ok: boolean) {
    req?.resolve({ ok, notify: ok && !!req?.notify && notifyChecked });
    confirmRequest.set(null);
  }

  // A dismissal (Escape, overlay) counts as a cancel.
  function onOpenChange(open: boolean) {
    if (!open && req) answer(false);
  }
</script>

<AlertDialog.Root open={!!req} {onOpenChange}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <AlertDialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <AlertDialog.Title class="text-lg font-semibold tracking-tight text-foreground">
        {req?.title ?? "Are you sure?"}
      </AlertDialog.Title>
      <AlertDialog.Description class="mt-1.5 text-sm text-foreground-alt">
        {req?.description}
      </AlertDialog.Description>

      {#if req?.notify}
        <label class="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
          <Checkbox.Root
            bind:checked={notifyChecked}
            class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background shadow-btn data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
          >
            {#snippet children({ checked })}
              {#if checked}<Icon name="check" size={12} />{/if}
            {/snippet}
          </Checkbox.Root>
          <span class="leading-snug">{req.notify.label}</span>
        </label>
      {/if}

      <div class="mt-6 flex justify-end gap-2">
        <AlertDialog.Cancel
          class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
        >
          {req?.cancelText ?? "Cancel"}
        </AlertDialog.Cancel>
        <AlertDialog.Action onclick={() => answer(true)}>
          {#snippet child({ props })}
            <Button {...props} variant={req?.destructive ? "destructive" : "solid"} class="h-10 px-5 text-sm">
              {req?.confirmText ?? "Confirm"}
            </Button>
          {/snippet}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
