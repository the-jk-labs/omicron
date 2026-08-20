<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import { endpoints, ApiError } from "$lib/api";
  import logo from "$lib/assets/omicron.svg";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { InstanceInfo } from "$lib/types";
  import { Label } from "bits-ui";
  import { onMount } from "svelte";

  // With a token in the URL we verify immediately; without one we offer to
  // (re)send a verification email.
  type State = "verifying" | "success" | "error" | "resend" | "resent";

  const token = $page.url.searchParams.get("token") ?? "";
  // Only the resend form depends on outbound email. A token already in hand
  // verifies fine either way — it reached the reader somehow — so the check
  // gates the form, not the whole page.
  const instance = $derived($page.data.instance as InstanceInfo | null);
  const canSendEmail = $derived(instance?.emailEnabled !== false);
  let view = $state<State>(token ? "verifying" : "resend");
  let errorMsg = $state("");

  let email = $state("");
  let busy = $state(false);
  let resendError = $state("");

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  onMount(async () => {
    if (!token) return;
    try {
      await endpoints().verifyEmail(token);
      view = "success";
    } catch (err) {
      errorMsg = err instanceof ApiError ? err.message : "Something went wrong.";
      view = "error";
    }
  });

  async function resend(e: SubmitEvent) {
    e.preventDefault();
    resendError = "";
    busy = true;
    try {
      await endpoints().resendVerification(email);
      view = "resent";
    } catch (err) {
      resendError = err instanceof ApiError ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle text="Verify email" />

{#if view === "verifying"}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon name="spinner" size={26} class="animate-spin" />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Confirming your email…</h1>
    <p class="mt-2 text-sm text-muted-foreground">This only takes a moment.</p>
  </div>
{:else if view === "success"}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="check" size={28} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Email confirmed</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      Your email address is verified. You're all set.
    </p>
    <Button href="/login" variant="solid" class="mt-6 h-11 w-full">Continue to sign in</Button>
  </div>
{:else if view === "error"}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Link didn't work</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{errorMsg}</p>
    <Button onclick={() => (view = "resend")} variant="solid" class="mt-6 h-11 w-full">Send a new link</Button>
  </div>
{:else if view === "resent"}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Check your inbox</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      If <span class="font-medium text-foreground">{email}</span> needs verifying, a fresh link is on its way. It expires
      in 24 hours.
    </p>
    <Button href="/login" variant="outline" class="mt-6 h-11 w-full">Back to sign in</Button>
  </div>
{:else if !canSendEmail}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">This instance can't send email</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      Confirmation links need outbound email, and it hasn't been set up here yet. Ask the administrator of
      <span class="font-medium text-foreground">{instance?.domain ?? "this instance"}</span> to configure it.
    </p>
    <Button href="/login" variant="outline" class="mt-6 h-11 w-full">Back to sign in</Button>
  </div>
{:else}
  <div class="mb-8 text-center">
    <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Verify your email</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">Enter your email and we'll send you a new confirmation link.</p>
  </div>

  <form onsubmit={resend} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label.Root for="email" class={labelClass}>Email</Label.Root>
      <input id="email" type="email" bind:value={email} autocomplete="email" class={field} />
    </div>
    {#if resendError}<p class="text-sm text-destructive">{resendError}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="mt-1 h-11">
      {busy ? "Sending…" : "Send confirmation link"}
    </Button>
  </form>

  <p class="mt-8 text-center text-sm text-muted-foreground">
    <Button href="/login" variant="link">Back to sign in</Button>
  </p>
{/if}
