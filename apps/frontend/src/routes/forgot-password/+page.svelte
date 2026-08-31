<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import logo from "$lib/assets/omicron.svg";
  import { authClient } from "$lib/auth-client";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { InstanceInfo } from "$lib/types";
  import { Label } from "bits-ui";

  // An instance still on the default `console` transport writes the reset link
  // to the backend log instead of sending it. Offering the form anyway ends the
  // only account-recovery path there is on a screen that says a message is on
  // its way, and nothing ever arrives — so say what is actually true and point
  // at the one person who can help.
  const instance = $derived(page.data.instance as InstanceInfo | null);
  const canSendEmail = $derived(instance?.emailEnabled !== false);

  let email = $state("");
  let error = $state("");
  let busy = $state(false);
  let sent = $state(false);

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      const res = await authClient.requestPasswordReset({
        email,
        redirectTo: `${location.origin}/reset-password`,
      });
      if (res.error) {
        error = res.error.message ?? "Something went wrong.";
        return;
      }
      sent = true;
    } catch {
      error = "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle text="Reset password" />

{#if !canSendEmail}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">This instance can't send email</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      Password reset needs outbound email, and it hasn't been set up here yet. Ask the administrator of
      <span class="font-medium text-foreground">{instance?.domain ?? "this instance"}</span> to reset your password or to
      configure email.
    </p>
    <Button href="/login" variant="outline" class="mt-6 h-11 w-full">Back to sign in</Button>
  </div>
{:else if sent}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Check your inbox</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      If an account matches <span class="font-medium text-foreground">{email}</span>, we've sent a link to reset your
      password. It expires in one hour.
    </p>
    <Button href="/login" variant="outline" class="mt-6 h-11 w-full">Back to sign in</Button>
  </div>
{:else}
  <div class="mb-8 text-center">
    <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Forgot your password?</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label.Root for="email" class={labelClass}>Email</Label.Root>
      <input id="email" type="email" bind:value={email} autocomplete="email" class={field} />
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="mt-1 h-11">
      {busy ? "Sending…" : "Send reset link"}
    </Button>
  </form>

  <p class="mt-8 text-center text-sm text-muted-foreground">
    Remembered it?
    <Button href="/login" variant="link">Sign in</Button>
  </p>
{/if}
