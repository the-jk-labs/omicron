<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import logo from "$lib/assets/omicron.svg";

  let identifier = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      await endpoints().login({ identifier, password });
      await invalidateAll();
      goto("/");
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Sign in · Omicron</title></svelte:head>

<div class="mx-auto max-w-sm py-6">
  <div class="mb-6 text-center">
    <div class="mb-3 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
    <p class="mt-1 text-sm text-muted-foreground">Sign in to continue to Omicron.</p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label.Root for="identifier" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Username or email</Label.Root>
      <input id="identifier" bind:value={identifier} autocomplete="username" class={field} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="password" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</Label.Root>
      <input id="password" type="password" bind:value={password} autocomplete="current-password" class={field} />
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid">
      {busy ? "Signing in…" : "Sign in"}
    </Button>
  </form>

  <p class="mt-6 text-center text-sm text-muted-foreground">
    No account?
    <Button href="/register" variant="link">Create one</Button>
  </p>
</div>