<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { AlertDialog } from "bits-ui";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirmRequest } from "$lib/components/ui/confirm";

  // Global host for the promise-based confirm() helper. Mounted once in the root
  // layout; renders the Bits UI AlertDialog whenever a request is pending and
  // resolves it with the user's choice.
  const req = $derived($confirmRequest);

  // Resolve the pending promise and clear the request. AlertDialog closes itself
  // when its open binding flips to false.
  function answer(value: boolean) {
    req?.resolve(value);
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
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <AlertDialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[420px]"
    >
      <AlertDialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        {req?.title ?? "Are you sure?"}
      </AlertDialog.Title>
      <AlertDialog.Description class="text-foreground-alt mt-1.5 text-sm">
        {req?.description}
      </AlertDialog.Description>

      <div class="mt-6 flex justify-end gap-2">
        <AlertDialog.Cancel
          class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
        >
          {req?.cancelText ?? "Cancel"}
        </AlertDialog.Cancel>
        <AlertDialog.Action onclick={() => answer(true)}>
          {#snippet child({ props })}
            <Button
              {...props}
              variant={req?.destructive ? "destructive" : "solid"}
              class="h-10 px-5 text-sm"
            >
              {req?.confirmText ?? "Confirm"}
            </Button>
          {/snippet}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>
