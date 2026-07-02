<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import logo from "$lib/assets/omicron.svg";

  let identifier = $state("");
  let error = $state("");
  let busy = $state(false);
  let sent = $state(false);

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      await endpoints().forgotPassword(identifier);
      sent = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Reset password · Omicron</title></svelte:head>

{#if sent}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="mail" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Check your inbox</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      If an account matches <span class="font-medium text-foreground">{identifier}</span>, we've
      sent a link to reset your password. It expires in one hour.
    </p>
    <Button href="/login" variant="outline" class="mt-6 h-11 w-full">Back to sign in</Button>
  </div>
{:else}
  <div class="mb-8 text-center">
    <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Forgot your password?</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">
      Enter your username or email and we'll send you a reset link.
    </p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label.Root for="identifier" class={labelClass}>Username or email</Label.Root>
      <input id="identifier" bind:value={identifier} autocomplete="username" class={field} />
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
