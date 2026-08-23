<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import { endpoints, ApiError } from "$lib/api";
  import logo from "$lib/assets/omicron.svg";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { InstanceInfo } from "$lib/types";
  import { Label } from "bits-ui";

  // "Omicron" is the software's name; the site has the operator's. Same
  // resolution order as the nav and PageTitle.
  const appName = $derived((page.data.instance as InstanceInfo | null)?.name || env.PUBLIC_APP_NAME || "Omicron");

  let identifier = $state("");
  let password = $state("");
  let showPassword = $state(false);
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

<PageTitle text="Sign in" />

<div class="mb-8 text-center">
  <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
  <h1 class="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
  <p class="mt-1.5 text-sm text-muted-foreground">Sign in to continue to {appName}.</p>
</div>

<form onsubmit={submit} class="flex flex-col gap-4">
  <div class="flex flex-col gap-1.5">
    <Label.Root for="identifier" class={labelClass}>Username or email</Label.Root>
    <input id="identifier" bind:value={identifier} autocomplete="username" class={field} />
  </div>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <Label.Root for="password" class={labelClass}>Password</Label.Root>
      <!-- The one escape hatch for a locked-out reader, so it has to read as a
           link before it is hovered. It used to be a bare <a> with
           `underline-offset-4 hover:underline` — an offset for an underline it
           never drew — in `text-xs text-muted-foreground`, which is this page's
           colour for helper text that is *not* interactive (the subtitle above,
           the prose below). It was the only anchor here without an underline,
           and on a touch device the hover rule never fires, so it stayed
           indistinguishable from a caption for good.
           Button variant="link" is the idiom every other link on these screens
           already uses ("Create one", "Sign in"): underlined, in the foreground
           colour. Kept one step down at text-xs so it stays subordinate to the
           label it sits beside. -->
      <Button href="/forgot-password" variant="link" class="text-xs">Forgot password?</Button>
    </div>
    <div class="relative">
      <input
        id="password"
        type={showPassword ? "text" : "password"}
        bind:value={password}
        autocomplete="current-password"
        class={`${field} w-full pr-10`}
      />
      <button
        type="button"
        onclick={() => (showPassword = !showPassword)}
        aria-label={showPassword ? "Parolu gizlət" : "Parolu göstər"}
        aria-pressed={showPassword}
        aria-controls="password"
        title={showPassword ? "Parolu gizlət" : "Parolu göstər"}
        class="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon name="eye" size={16} />
      </button>
    </div>
  </div>
  {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
  <Button type="submit" disabled={busy} variant="solid" class="mt-1 h-11">
    {busy ? "Signing in…" : "Sign in"}
  </Button>
</form>

<p class="mt-8 text-center text-sm text-muted-foreground">
  No account?
  <Button href="/register" variant="link">Create one</Button>
</p>
