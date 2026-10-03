<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Offers a passkey once per sign-in to a reader who has none. Closing it parks
     a flag in this browser (see passkeyPrompt.ts) so it stays quiet until the
     next sign-in or sign-out. -->
<script lang="ts">
  import { Dialog, Label } from "bits-ui";
  import { authClient } from "#lib/auth-client.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import UsernameHint from "#lib/components/UsernameHint.svelte";
  import { dismissPasskeyPrompt, passkeyPromptDismissed } from "#lib/passkeyPrompt.js";
  import { addPasskeyError, confirmPassword, needsFreshSignIn, passkeysSupported } from "#lib/passkeys.js";

  // Offered only on the home page, so it never interrupts a flow like sign-up's
  // email verification; a sign-in elsewhere is offered once the reader gets there.
  let { user, onHome }: { user: { id: string; username: string } | null; onHome: boolean } = $props();

  let open = $state(false);
  // "confirm": the session is too old to add a sign-in method, so the password is asked first.
  let step = $state<"offer" | "added" | "confirm">("offer");
  const TITLES = {
    offer: "Sign in faster with a passkey",
    confirm: "Confirm it's you",
    added: "Passkey added",
  } as const;
  let adding = $state(false);
  let password = $state("");
  let error = $state("");
  // Checked once per sign-in. The app signs in and out without a page load, so a
  // sign-out must clear this or the same account signing back in is skipped.
  let checkedFor: string | null = null;

  async function offerIfNone() {
    const res = await authClient.passkey.listUserPasskeys().catch(() => null);
    if (res?.data?.length === 0 && !passkeyPromptDismissed()) {
      step = "offer";
      error = "";
      open = true;
    }
  }

  $effect(() => {
    const userId = user?.id;
    if (!userId) {
      checkedFor = null;
      open = false;
      return;
    }
    if (!onHome || userId === checkedFor) return;
    checkedFor = userId;
    if (passkeysSupported() && !passkeyPromptDismissed()) void offerIfNone();
  });

  function onOpenChange(next: boolean) {
    open = next;
    if (!next) dismissPasskeyPrompt();
  }

  async function add() {
    error = "";
    adding = true;
    try {
      const res = await authClient.passkey.addPasskey();
      if (!res?.error) step = "added";
      else if (needsFreshSignIn(res.error)) step = "confirm";
      else error = addPasskeyError(res.error);
    } finally {
      adding = false;
    }
  }

  async function confirmAndAdd(e: SubmitEvent) {
    e.preventDefault();
    if (!user || !password) return;
    error = "";
    adding = true;
    const failed = await confirmPassword(user.username, password);
    adding = false;
    if (failed) {
      error = failed;
      return;
    }
    password = "";
    step = "offer";
    await add();
  }
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[420px]"
    >
      <div class="flex items-center gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
          <Icon name={step === "added" ? "check" : "key"} size={18} />
        </span>
        <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">{TITLES[step]}</Dialog.Title>
      </div>

      {#if step === "added"}
        <Dialog.Description class="mt-3 text-sm text-foreground-alt">
          Next time, choose your passkey when you sign in. You can rename or remove it in Settings.
        </Dialog.Description>
      {:else if step === "confirm"}
        <Dialog.Description class="mt-3 text-sm text-foreground-alt">
          For your security, enter your password before adding a new way to sign in.
        </Dialog.Description>
        <form id="passkey-confirm" onsubmit={confirmAndAdd} class="mt-4 flex flex-col gap-1.5">
          <UsernameHint username={user?.username ?? ""} />
          <Label.Root for="passkey-confirm-password" class="text-sm leading-none font-medium text-foreground">
            Password
          </Label.Root>
          <input
            id="passkey-confirm-password"
            type="password"
            bind:value={password}
            autocomplete="current-password"
            class="h-11 rounded-input border border-input bg-background px-3.5 text-sm shadow-btn outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground"
          />
        </form>
      {:else}
        <Dialog.Description class="mt-3 text-sm text-foreground-alt">
          Use your fingerprint, face, or screen lock instead of your password.
        </Dialog.Description>
      {/if}

      {#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}

      <div class="mt-6 flex justify-end gap-2">
        {#if step === "added"}
          <Dialog.Close>
            {#snippet child({ props })}
              <Button {...props} variant="solid" class="h-10 px-5">Done</Button>
            {/snippet}
          </Dialog.Close>
        {:else}
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Not now
          </Dialog.Close>
          {#if step === "confirm"}
            <Button
              type="submit"
              form="passkey-confirm"
              variant="solid"
              class="h-10 px-5"
              disabled={adding || !password}
            >
              {adding ? "Checking…" : "Continue"}
            </Button>
          {:else}
            <Button variant="solid" class="h-10 px-5" disabled={adding} onclick={add}>
              {adding ? "Waiting for your device…" : "Add a passkey"}
            </Button>
          {/if}
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
