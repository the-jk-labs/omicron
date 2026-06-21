<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";

  let identifier = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

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

<div class="mx-auto max-w-sm">
  <h1 class="mb-6 text-2xl font-bold tracking-tight text-neutral-900">Welcome back</h1>
  <form onsubmit={submit} class="flex flex-col gap-3">
    <input
      placeholder="Username or email"
      bind:value={identifier}
      autocomplete="username"
      class="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
    />
    <input
      type="password"
      placeholder="Password"
      bind:value={password}
      autocomplete="current-password"
      class="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
    />
    {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="justify-center">
      {busy ? "Signing in…" : "Sign in"}
    </Button>
  </form>
  <p class="mt-4 text-sm text-neutral-500">
    No account? <Button href="/register" variant="ghost" class="!px-0 underline">Create one</Button>
  </p>
</div>
