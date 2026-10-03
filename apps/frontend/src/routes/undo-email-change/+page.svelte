<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Reached from the "your email was changed" notice. Acts only on a click:
     mail scanners open links in emails on their own. -->
<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { page } from "$app/state";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import Button from "#lib/components/ui/Button.svelte";

  const token = $derived(page.url.searchParams.get("token") ?? "");

  let busy = $state(false);
  let error = $state("");
  let restored = $state("");

  async function undo() {
    error = "";
    busy = true;
    try {
      restored = (await endpoints().undoEmailChange(token)).email;
      // Every session just ended, this one included.
      await refreshAll();
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong. Try again.";
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle text="Undo email change" />

{#if restored}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="check" size={28} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Your account is secured</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      Your email is back to <strong class="font-medium text-foreground">{restored}</strong>. We sent a link there to set
      a new password.
    </p>
    <Button href="/forgot-password" variant="outline" class="mt-6 h-11 w-full">Didn't get it? Send another</Button>
  </div>
{:else if !token}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Link incomplete</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      This link is missing its token. Open it again from the email, or contact the instance administrator.
    </p>
  </div>
{:else}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="alert" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Undo the email change?</h1>
    <p class="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
      This puts your old email back and locks the account down in case someone else made the change: every device is
      signed out, all passkeys are removed, and your password stops working. We'll email you a link to set a new one.
    </p>
    {#if error}<p class="mt-4 text-sm text-destructive" role="alert">{error}</p>{/if}
    <Button variant="destructive" class="mt-6 h-11 w-full" disabled={busy} onclick={undo}>
      {busy ? "Securing your account…" : "Undo and secure my account"}
    </Button>
  </div>
{/if}
