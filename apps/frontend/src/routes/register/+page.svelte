<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";

  let username = $state("");
  let email = $state("");
  let displayName = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  const field =
    "rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm outline-none focus:border-neutral-900";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    busy = true;
    try {
      await endpoints().register({ username, email, password, displayName });
      await invalidateAll();
      goto("/");
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Create account · Omicron</title></svelte:head>

<div class="mx-auto max-w-sm py-6">
  <div class="mb-6 text-center">
    <div class="mb-3 flex justify-center text-neutral-900"><Icon name="feather" size={32} /></div>
    <h1 class="text-2xl font-bold tracking-tight text-neutral-900">Create your account</h1>
    <p class="mt-1 text-sm text-neutral-500">The first account on a fresh instance becomes the admin.</p>
  </div>

  <form onsubmit={submit} class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label.Root for="displayName" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Display name</Label.Root>
      <input id="displayName" bind:value={displayName} class={field} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="username" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Username</Label.Root>
      <input id="username" bind:value={username} autocomplete="username" placeholder="a-z, 0-9, _" class={field} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="email" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Email</Label.Root>
      <input id="email" type="email" bind:value={email} autocomplete="email" class={field} />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="password" class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Password</Label.Root>
      <input id="password" type="password" bind:value={password} autocomplete="new-password" placeholder="min 8 characters" class={field} />
    </div>
    {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="justify-center py-2.5">
      {busy ? "Creating…" : "Create account"}
    </Button>
  </form>

  <p class="mt-6 text-center text-sm text-neutral-500">
    Already have an account?
    <Button href="/login" variant="link">Sign in</Button>
  </p>
</div>
