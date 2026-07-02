<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import logo from "$lib/assets/omicron.svg";

  const token = $derived($page.url.searchParams.get("token") ?? "");

  let password = $state("");
  let confirm = $state("");
  let error = $state("");
  let busy = $state(false);
  let done = $state(false);

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    if (password.length < 8) {
      error = "Password must be at least 8 characters.";
      return;
    }
    if (password !== confirm) {
      error = "Passwords don't match.";
      return;
    }
    busy = true;
    try {
      await endpoints().resetPassword(token, password);
      done = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Set a new password · Omicron</title></svelte:head>

{#if done}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="check" size={28} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Password updated</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      Your password has been changed and you've been signed out everywhere. Sign in with your new
      password.
    </p>
    <Button href="/login" variant="solid" class="mt-6 h-11 w-full">Sign in</Button>
  </div>
{:else if !token}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon name="lock" size={26} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Link incomplete</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      This reset link is missing its token. Request a fresh one and try again.
    </p>
    <Button href="/forgot-password" variant="solid" class="mt-6 h-11 w-full">
      Request a new link
    </Button>
  </div>
{:else}
  <div class="mb-8 text-center">
    <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Set a new password</h1>
    <p class="mt-1.5 text-sm text-muted-foreground">Choose a strong password you don't use elsewhere.</p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label.Root for="password" class={labelClass}>New password</Label.Root>
      <input id="password" type="password" bind:value={password} autocomplete="new-password" placeholder="min 8 characters" class={field} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="confirm" class={labelClass}>Confirm password</Label.Root>
      <input id="confirm" type="password" bind:value={confirm} autocomplete="new-password" class={field} />
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="mt-1 h-11">
      {busy ? "Saving…" : "Update password"}
    </Button>
  </form>
{/if}
