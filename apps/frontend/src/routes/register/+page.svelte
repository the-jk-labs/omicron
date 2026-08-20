<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import { endpoints, ApiError } from "$lib/api";
  import logo from "$lib/assets/omicron.svg";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { InstanceInfo } from "$lib/types";
  import { Label } from "bits-ui";

  // Whose site this is. The line under the heading used to say that the first
  // account on a fresh instance becomes the admin — which no visitor of this
  // page can ever act on: the layout gate redirects every route to /setup until
  // setup is complete, and setup is complete as soon as a single account exists
  // (isSetupComplete in instanceSetup.ts). By the time /register renders, the
  // admin exists. So it promised a role the reader can't have and volunteered
  // the instance's setup state to a stranger.
  //
  // What a sign-up form on a federated network actually owes the reader is the
  // name of the instance they're joining, which is the operator's, not the
  // project's. Resolution order matches the nav and PageTitle: admin-configured
  // name, then the build-time env, then the project name as a last resort.
  const instance = $derived(page.data.instance as InstanceInfo | null);
  const appName = $derived(instance?.name || env.PUBLIC_APP_NAME || "Omicron");

  let username = $state("");
  let email = $state("");
  let displayName = $state("");
  let password = $state("");
  let error = $state("");
  let busy = $state(false);

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

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

<PageTitle text="Create account" />

<div class="mb-8 text-center">
  <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
  <h1 class="text-2xl font-bold tracking-tight text-foreground">Create your account</h1>
  <!-- Federation is an operator's switch: an instance can be run as a standalone
       blog, and this flag is the state the backend is actually running with, not
       a pending toggle. Don't promise the fediverse to someone who won't get it. -->
  <p class="mt-1.5 text-sm text-muted-foreground">
    {#if instance?.federationEnabled}
      Join {appName} and follow writers across the fediverse.
    {:else}
      Join {appName} and start writing.
    {/if}
  </p>
</div>

<form onsubmit={submit} class="flex flex-col gap-4">
  <div class="flex flex-col gap-1.5">
    <Label.Root for="displayName" class={labelClass}>Display name</Label.Root>
    <input id="displayName" bind:value={displayName} class={field} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label.Root for="username" class={labelClass}>Username</Label.Root>
    <input id="username" bind:value={username} autocomplete="username" placeholder="a-z, 0-9, _" class={field} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label.Root for="email" class={labelClass}>Email</Label.Root>
    <input id="email" type="email" bind:value={email} autocomplete="email" class={field} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label.Root for="password" class={labelClass}>Password</Label.Root>
    <input
      id="password"
      type="password"
      bind:value={password}
      autocomplete="new-password"
      placeholder="min 8 characters"
      class={field}
    />
  </div>
  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
  <Button type="submit" disabled={busy} variant="solid" class="mt-1 h-11">
    {busy ? "Creating…" : "Create account"}
  </Button>
</form>

<p class="mt-8 text-center text-sm text-muted-foreground">
  Already have an account?
  <Button href="/login" variant="link">Sign in</Button>
</p>
