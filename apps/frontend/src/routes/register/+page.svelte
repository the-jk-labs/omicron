<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { env } from "$env/dynamic/public";
  import logo from "$lib/assets/omicron.svg";
  import { authClient } from "$lib/auth-client";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { MIN_PASSWORD_LEN, passwordStrength, passwordRequirements, isPwnedPasswordClient } from "$lib/password";
  import type { InstanceInfo } from "$lib/types";
  import { Checkbox, Label } from "bits-ui";

  const instance = $derived(page.data.instance as InstanceInfo | null);
  const appName = $derived(instance?.name || env.PUBLIC_APP_NAME || "Omicron");

  const MAX_DISPLAY_NAME_LEN = 60;

  let username = $state("");
  let email = $state("");
  let displayName = $state("");
  let password = $state("");
  let confirmPassword = $state("");
  let acceptTerms = $state(false);
  let showPassword = $state(false);
  let showConfirm = $state(false);
  let error = $state("");
  let busy = $state(false);
  let touched = $state({ username: false, email: false, password: false, confirm: false, terms: false });

  let pwned = $state<boolean | null>(null);
  let pwnedChecking = $state(false);
  let pwnedTimer: ReturnType<typeof setTimeout> | null = null;

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground aria-[invalid=true]:border-destructive";
  const labelClass = "text-sm font-medium leading-none text-foreground";
  const errClass = "text-xs text-destructive";

  const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const usernameError = $derived.by(() => {
    if (!touched.username && !username) return "";
    const v = username.trim().toLowerCase();
    if (!v) return "Choose a username.";
    if (!USERNAME_RE.test(v)) return "3–30 characters: lowercase letters, numbers, underscore.";
    return "";
  });
  const emailError = $derived.by(() => {
    if (!touched.email && !email) return "";
    const v = email.trim().toLowerCase();
    if (!v) return "Enter your email address.";
    if (v.length > 254 || !EMAIL_RE.test(v)) return "Enter a valid email address.";
    return "";
  });
  const passwordError = $derived.by(() => {
    if (!touched.password && !password) return "";
    if (!password) return `Password is required (at least ${MIN_PASSWORD_LEN} characters).`;
    if (password.length < MIN_PASSWORD_LEN) return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    if (password.length > 128) return "Password must be at most 128 characters.";
    if (pwned === true) return "This password has appeared in a data breach — please choose a different one.";
    return "";
  });
  const confirmError = $derived.by(() => {
    if (!touched.confirm && !confirmPassword) return "";
    if (!confirmPassword) return "Repeat your password.";
    if (password !== confirmPassword) return "Passwords do not match.";
    return "";
  });
  const termsError = $derived.by(() => {
    if (!touched.terms) return "";
    if (!acceptTerms) return "You must accept the Terms and Privacy Policy.";
    return "";
  });

  const strength = $derived(passwordStrength(password));
  const reqs = $derived(passwordRequirements(password));

  // HIBP k-anonymity check — debounced, fail-open, does not block typing.
  function schedulePwnedCheck(pw: string) {
    if (pwnedTimer) clearTimeout(pwnedTimer);
    if (pw.length < MIN_PASSWORD_LEN) {
      pwned = null;
      pwnedChecking = false;
      return;
    }
    pwnedChecking = true;
    pwnedTimer = setTimeout(async () => {
      const res = await isPwnedPasswordClient(pw);
      // only apply if the field hasn't changed while we were fetching
      if (pw === password) {
        pwned = res;
        pwnedChecking = false;
      }
    }, 600);
  }

  $effect(() => {
    // trigger on password change — reading `password` subscribes the effect
    const pw = password;
    schedulePwnedCheck(pw);
  });

  const canSubmit = $derived(
    !busy &&
      username.trim() &&
      email.trim() &&
      password.length >= MIN_PASSWORD_LEN &&
      password === confirmPassword &&
      acceptTerms &&
      !usernameError &&
      !emailError &&
      !passwordError &&
      !confirmError &&
      pwned !== true,
  );

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    touched = { username: true, email: true, password: true, confirm: true, terms: true };
    if (displayName.trim().length > MAX_DISPLAY_NAME_LEN) {
      error = `Display name must be at most ${MAX_DISPLAY_NAME_LEN} characters.`;
      return;
    }
    if (!acceptTerms) {
      error = "Please accept the Terms to create an account.";
      return;
    }
    if (usernameError || emailError || passwordError || confirmError) return;
    if (password !== confirmPassword) return;
    if (pwned === true) return;

    error = "";
    busy = true;
    try {
      // final pwned gate (in case the debounced check is still pending)
      const pwnedNow = await isPwnedPasswordClient(password);
      if (pwnedNow === true) {
        pwned = true;
        error = "This password has appeared in a data breach — please choose a different one.";
        busy = false;
        return;
      }
      const res = await authClient.signUp.email({
        email,
        password,
        name: displayName.trim() || username,
        username,
      });
      if (res.error) {
        error = res.error.message ?? "Something went wrong.";
        return;
      }
      await invalidateAll();
      goto("/");
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong.";
    } finally {
      busy = false;
    }
  }
</script>

<PageTitle text="Create account" />

<div class="mb-8 text-center">
  <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
  <h1 class="text-2xl font-bold tracking-tight text-foreground">Create your account</h1>
  <p class="mt-1.5 text-sm text-muted-foreground">
    {#if instance?.federationEnabled}
      Join {appName} and follow writers across the fediverse.
    {:else}
      Join {appName} and start writing.
    {/if}
  </p>
</div>

<form onsubmit={submit} class="flex flex-col gap-4" novalidate>
  <div class="flex flex-col gap-1.5">
    <Label.Root for="displayName" class={labelClass}
      >Display name <span class="font-normal text-muted-foreground">(optional)</span></Label.Root
    >
    <input
      id="displayName"
      bind:value={displayName}
      autocomplete="name"
      placeholder="Ada Lovelace"
      maxlength={MAX_DISPLAY_NAME_LEN}
      aria-describedby="displayName-hint"
      class={field}
    />
    <p id="displayName-hint" class="text-xs text-muted-foreground">
      {displayName.length}/{MAX_DISPLAY_NAME_LEN} — shown on posts and your profile. Long names are truncated with an ellipsis;
      hover to see the full name.
    </p>
    {#if displayName.length > MAX_DISPLAY_NAME_LEN}
      <p class="text-xs text-destructive" aria-live="polite">
        Display name must be at most {MAX_DISPLAY_NAME_LEN} characters.
      </p>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label.Root for="username" class={labelClass}>Username</Label.Root>
    <input
      id="username"
      bind:value={username}
      onblur={() => (touched.username = true)}
      autocomplete="username"
      autocapitalize="off"
      spellcheck={false}
      placeholder="a-z, 0-9, _"
      aria-invalid={!!usernameError}
      aria-describedby={usernameError ? "username-error" : undefined}
      class={field}
    />
    <p id="username-error" class={errClass} aria-live="polite">{usernameError}</p>
  </div>

  <div class="flex flex-col gap-1.5">
    <Label.Root for="email" class={labelClass}>Email</Label.Root>
    <input
      id="email"
      type="email"
      bind:value={email}
      onblur={() => (touched.email = true)}
      autocomplete="email"
      spellcheck={false}
      placeholder="ada@example.com"
      aria-invalid={!!emailError}
      aria-describedby={emailError ? "email-error" : "email-hint"}
      class={field}
    />
    {#if emailError}
      <p id="email-error" class={errClass} aria-live="polite">{emailError}</p>
    {:else}
      <p id="email-hint" class="text-xs text-muted-foreground">We’ll send a verification link to this address.</p>
    {/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label.Root for="password" class={labelClass}>Password</Label.Root>
    <div class="relative">
      <input
        id="password"
        type={showPassword ? "text" : "password"}
        bind:value={password}
        onblur={() => (touched.password = true)}
        autocomplete="new-password"
        placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
        aria-invalid={!!passwordError}
        aria-describedby="password-error password-reqs password-strength"
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
      <div id="password-strength" class="flex items-center gap-1.5">
        <div class="flex flex-1 gap-1">
          {#each [1, 2, 3, 4] as i (i)}
            <div
              class={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.score ? (strength.score <= 1 ? "bg-destructive" : strength.score === 2 ? "bg-tertiary" : strength.score === 3 ? "bg-foreground/60" : "bg-foreground") : "bg-muted"}`}
            ></div>
          {/each}
        </div>
        <span
          class={`min-w-12 text-right text-xs font-medium ${strength.score <= 1 ? "text-destructive" : strength.score === 2 ? "text-tertiary" : "text-muted-foreground"}`}
        >
          {#if pwnedChecking}Checking…{:else}{strength.label}{/if}
        </span>
      </div>
    {/if}

    <ul id="password-reqs" class="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
      {#each reqs as r (r.id)}
        <li class={`flex items-center gap-1.5 ${r.ok ? "text-foreground" : "text-muted-foreground"}`}>
          <span
            class={`inline-flex size-4 items-center justify-center rounded-full border text-[10px] ${r.ok ? "border-foreground bg-foreground text-background" : "border-border bg-background"}`}
          >
            {#if r.ok}<Icon name="check" size={10} />{/if}
          </span>
          {r.label}
        </li>
      {/each}
    </ul>
    {#if pwned === true}
      <p class="text-xs font-medium text-destructive" aria-live="polite">
        This password was found in a breach — choose a different one.
      </p>
    {:else if pwned === false && password.length >= MIN_PASSWORD_LEN}
      <p class="text-xs text-muted-foreground" aria-live="polite">Not found in known breaches.</p>
    {/if}
    {#if passwordError}<p id="password-error" class={errClass} aria-live="polite">{passwordError}</p>{/if}
  </div>

  <div class="flex flex-col gap-1.5">
    <Label.Root for="confirmPassword" class={labelClass}>Confirm password</Label.Root>
    <div class="relative">
      <input
        id="confirmPassword"
        type={showConfirm ? "text" : "password"}
        bind:value={confirmPassword}
        onblur={() => (touched.confirm = true)}
        autocomplete="new-password"
        aria-invalid={!!confirmError}
        aria-describedby={confirmError ? "confirm-error" : undefined}
        class={`${field} w-full pr-10`}
      />
      <button
        type="button"
        onclick={() => (showConfirm = !showConfirm)}
        aria-label={showConfirm ? "Hide password" : "Show password"}
        aria-pressed={showConfirm}
        aria-controls="confirmPassword"
        title={showConfirm ? "Hide password" : "Show password"}
        class="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon name="eye" size={16} />
      </button>
    </div>
    {#if confirmError}<p id="confirm-error" class={errClass} aria-live="polite">{confirmError}</p>{/if}
  </div>

  <label class="flex items-start gap-2.5 rounded-input border border-border bg-muted/30 p-3">
    <Checkbox.Root
      bind:checked={acceptTerms}
      onCheckedChange={() => (touched.terms = true)}
      id="terms"
      aria-invalid={!!termsError}
      aria-describedby={termsError ? "terms-error" : undefined}
      class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-background shadow-btn data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
    >
      {#snippet children({ checked })}
        {#if checked}<Icon name="check" size={12} />{/if}
      {/snippet}
    </Checkbox.Root>
    <span class="text-sm leading-snug text-foreground">
      I agree to the <a href="/privacy" class="underline underline-offset-4 hover:text-muted-foreground"
        >Privacy Policy</a
      >
      and <a href="/contact" class="underline underline-offset-4 hover:text-muted-foreground">Terms</a>.
    </span>
  </label>
  {#if termsError}<p id="terms-error" class={errClass} aria-live="polite">{termsError}</p>{/if}

  <div class="rounded-input border border-border bg-background px-3 py-2.5">
    <p class="flex items-center gap-1.5 text-xs font-medium text-foreground">
      <Icon name="shieldOff" size={14} /> Bot protection
    </p>
    <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
      This form is protected by Anubis proof-of-work. Most visitors see no challenge; automated abuse is slowed at the
      edge.
    </p>
  </div>

  {#if error}<p class="text-sm font-medium text-destructive" role="alert" aria-live="assertive">{error}</p>{/if}

  <Button type="submit" disabled={!canSubmit} variant="solid" class="mt-1 h-11" aria-disabled={!canSubmit}>
    {busy ? "Creating…" : "Create account"}
  </Button>
  <p class="text-center text-xs leading-relaxed text-muted-foreground">
    After signing up, we’ll email you a verification link. You can sign in right away; verified email may be required
    later depending on this instance’s settings.
  </p>
</form>

<p class="mt-8 text-center text-sm text-muted-foreground">
  Already have an account?
  <Button href="/login" variant="link">Sign in</Button>
</p>
