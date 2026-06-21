<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";

  let username = $state("");
  let email = $state("");
  let displayName = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

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

<div class="mx-auto max-w-sm">
  <h1 class="mb-2 text-2xl font-bold tracking-tight text-neutral-900">Create your account</h1>
  <p class="mb-6 text-sm text-neutral-500">The first account on a fresh instance becomes the admin.</p>
  <form onsubmit={submit} class="flex flex-col gap-3">
    <input
      placeholder="Display name"
      bind:value={displayName}
      class="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
    />
    <input
      placeholder="Username (a-z, 0-9, _)"
      bind:value={username}
      autocomplete="username"
      class="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
    />
    <input
      type="email"
      placeholder="Email"
      bind:value={email}
      autocomplete="email"
      class="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
    />
    <input
      type="password"
      placeholder="Password (min 8 chars)"
      bind:value={password}
      autocomplete="new-password"
      class="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
    />
    {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="justify-center">
      {busy ? "Creating…" : "Create account"}
    </Button>
  </form>
  <p class="mt-4 text-sm text-neutral-500">
    Already have an account? <Button href="/login" variant="ghost" class="!px-0 underline">Sign in</Button>
  </p>
</div>
