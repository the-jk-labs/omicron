<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import logo from "$lib/assets/omicron.svg";
  import { authClient } from "$lib/auth-client";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { MIN_PASSWORD_LEN, passwordStrength, passwordRequirements, isPwnedPasswordClient } from "$lib/password";
  import { Label } from "bits-ui";

  const token = $derived($page.url.searchParams.get("token") ?? "");

  let password = $state("");
  let confirm = $state("");
  let showPassword = $state(false);
  let showConfirm = $state(false);
  let error = $state("");
  let busy = $state(false);
  let done = $state(false);

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground aria-[invalid=true]:border-destructive";
  const labelClass = "text-sm font-medium leading-none text-foreground";
  const strength = $derived(passwordStrength(password));
  const reqs = $derived(passwordRequirements(password));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    if (password.length < MIN_PASSWORD_LEN) {
      error = `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
      return;
    }
    if (password !== confirm) {
      error = "Passwords don't match.";
      return;
    }
    const pwned = await isPwnedPasswordClient(password);
    if (pwned === true) {
      error = "This password has appeared in a data breach — please choose a different one.";
      return;
    }
    busy = true;
    try {
      const res = await authClient.resetPassword({ newPassword: password, token });
      if (res.error) {
        error = res.error.message ?? "This reset link is invalid or has expired.";
        return;
      }
      done = true;
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle text="Set a new password" />

{#if done}
  <div class="flex flex-col items-center text-center">
    <div class="mb-5 flex size-14 items-center justify-center rounded-full bg-muted text-foreground">
      <Icon name="check" size={28} />
    </div>
    <h1 class="text-2xl font-bold tracking-tight text-foreground">Password updated</h1>
    <p class="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
      Your password has been changed and you've been signed out everywhere. Sign in with your new password.
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
    <Button href="/forgot-password" variant="solid" class="mt-6 h-11 w-full">Request a new link</Button>
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
      <div class="relative">
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          bind:value={password}
          autocomplete="new-password"
          placeholder={`at least ${MIN_PASSWORD_LEN} characters`}
          aria-invalid={!!error && password.length < MIN_PASSWORD_LEN}
          aria-describedby="password-reqs"
          class={`${field} w-full pr-10`}
        />
        <button
          type="button"
          onclick={() => (showPassword = !showPassword)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
          aria-controls="password"
          title={showPassword ? "Hide password" : "Show password"}
          class="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="eye" size={16} />
        </button>
      </div>
      {#if password}
        <div class="flex items-center gap-1.5">
          <div class="flex flex-1 gap-1">
            {#each [1, 2, 3, 4] as i (i)}
              <div
                class={`h-1.5 flex-1 rounded-full ${i <= strength.score ? (strength.score <= 1 ? "bg-destructive" : strength.score === 2 ? "bg-tertiary" : strength.score === 3 ? "bg-foreground/60" : "bg-foreground") : "bg-muted"}`}
              ></div>
            {/each}
          </div>
          <span class="min-w-12 text-right text-xs font-medium text-muted-foreground">{strength.label}</span>
        </div>
      {/if}
      <ul id="password-reqs" class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        {#each reqs as r (r.id)}
          <li class={`flex items-center gap-1.5 ${r.ok ? "text-foreground" : "text-muted-foreground"}`}>
            <span
              class={`inline-flex size-4 items-center justify-center rounded-full border text-[10px] ${r.ok ? "border-foreground bg-foreground text-background" : "border-border bg-background"}`}
              >{#if r.ok}<Icon name="check" size={10} />{/if}</span
            >
            {r.label}
          </li>
        {/each}
      </ul>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="confirm" class={labelClass}>Confirm password</Label.Root>
      <div class="relative">
        <input
          id="confirm"
          type={showConfirm ? "text" : "password"}
          bind:value={confirm}
          autocomplete="new-password"
          aria-invalid={password !== confirm && !!confirm}
          class={`${field} w-full pr-10`}
        />
        <button
          type="button"
          onclick={() => (showConfirm = !showConfirm)}
          aria-label={showConfirm ? "Hide password" : "Show password"}
          aria-pressed={showConfirm}
          aria-controls="confirm"
          title={showConfirm ? "Hide password" : "Show password"}
          class="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="eye" size={16} />
        </button>
      </div>
      {#if confirm && password !== confirm}<p class="text-xs text-destructive" aria-live="polite">
          Passwords do not match.
        </p>{/if}
    </div>
    {#if error}<p class="text-sm text-destructive" role="alert" aria-live="assertive">{error}</p>{/if}
    <Button type="submit" disabled={busy} variant="solid" class="mt-1 h-11">
      {busy ? "Saving…" : "Update password"}
    </Button>
  </form>
{/if}
