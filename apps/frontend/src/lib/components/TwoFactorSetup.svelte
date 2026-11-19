<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Turns on authenticator-app sign-in: password → scan the QR code (or type the
     key) → confirm a code → save the backup codes. Staff get no backup codes: they
     recover through an admin or the server shell (see backend auth/auth.ts). -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { tick, type Snippet } from "svelte";
  import { authClient } from "#lib/auth-client.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import UsernameHint from "#lib/components/UsernameHint.svelte";
  import { totpDigits, totpKey, totpQrSvg, twoFactorError } from "#lib/twoFactor.js";

  let {
    username,
    staff,
    ondone,
    actions,
  }: {
    username: string;
    /** A moderator or admin: no backup codes. */
    staff: boolean;
    ondone: () => void;
    /** Extra buttons beside Continue on the first step (a dialog's Cancel). */
    actions?: Snippet;
  } = $props();

  type Step = "password" | "scan" | "codes";

  let step = $state<Step>("password");
  let password = $state("");
  let code = $state("");
  let totpURI = $state("");
  let backupCodes = $state<string[]>([]);
  let error = $state("");
  let busy = $state(false);
  let copied = $state<"key" | "codes" | null>(null);
  let root = $state<HTMLElement | null>(null);

  const field =
    "h-11 w-full rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  const key = $derived(totpKey(totpURI));
  const qr = $derived(totpURI ? totpQrSvg(totpURI) : "");
  const canContinue = $derived(
    !busy && (step === "password" ? password.length > 0 : step === "scan" ? code.length === 6 : true),
  );

  async function go(next: Step) {
    step = next;
    error = "";
    await tick();
    root?.querySelector<HTMLElement>("[data-step-focus]")?.focus();
  }

  async function copy(text: string, what: "key" | "codes") {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    copied = what;
    setTimeout(() => (copied = null), 2000);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canContinue) return;
    error = "";
    if (step === "codes") return ondone();
    busy = true;
    try {
      if (step === "password") {
        const res = await authClient.twoFactor.enable({ password });
        if (res.error) {
          error = twoFactorError(res.error);
          return;
        }
        if (res.data.method !== "totp") return;
        totpURI = res.data.totpURI;
        backupCodes = res.data.backupCodes;
        await go("scan");
        return;
      }
      const res = await authClient.twoFactor.verifyTotp({ code });
      if (res.error) {
        error = twoFactorError(res.error);
        return;
      }
      password = "";
      if (staff || backupCodes.length === 0) ondone();
      else await go("codes");
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong. Try again.";
    } finally {
      busy = false;
    }
  }
</script>

<form bind:this={root} onsubmit={submit}>
  <UsernameHint {username} />

  {#if step === "password"}
    <p class="text-sm text-muted-foreground">
      You'll need an authenticator app, like Google Authenticator, Microsoft Authenticator, 1Password or Aegis. First,
      confirm it's you.
    </p>
    <div class="mt-4 flex flex-col gap-1.5">
      <Label.Root for="two-factor-password" class={labelClass}>Password</Label.Root>
      <input
        id="two-factor-password"
        type="password"
        name="password"
        bind:value={password}
        autocomplete="current-password"
        data-step-focus
        class={field}
      />
    </div>
  {:else if step === "scan"}
    <p class="text-sm text-muted-foreground">
      Scan this code with your authenticator app, or save it in your password manager (1Password, Bitwarden and others
      can scan it from this page).
    </p>
    <div class="mt-4 flex flex-col items-center gap-3">
      <!-- Generated locally from the setup URI; it never leaves the browser. -->
      <div
        class="size-44 rounded-card border border-border bg-white p-2 shadow-mini [&>svg]:size-full"
        role="img"
        aria-label="QR code for your authenticator app"
      >
        {@html qr}
      </div>
      <!-- Opens an installed authenticator or password manager (1Password, Bitwarden…) to save it. -->
      <Button href={totpURI} variant="link" class="text-sm">Open in authenticator app</Button>
      <div class="flex w-full flex-col items-center gap-1 text-center">
        <p class="text-xs text-muted-foreground">Can't scan it? Enter this key in the app instead:</p>
        <div class="flex max-w-full items-center gap-1">
          <code
            class="truncate rounded-input bg-muted px-2 py-1 font-mono text-xs text-foreground"
            data-testid="totp-key">{key}</code
          >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Copy key"
            onclick={() => copy(key.replaceAll(" ", ""), "key")}
          >
            <Icon name={copied === "key" ? "check" : "copy"} size={14} />
          </Button>
        </div>
      </div>
    </div>
    <div class="mt-4 flex flex-col gap-1.5">
      <Label.Root for="two-factor-code" class={labelClass}>6-digit code from the app</Label.Root>
      <input
        id="two-factor-code"
        bind:value={code}
        oninput={() => (code = totpDigits(code))}
        inputmode="numeric"
        name="otp"
        autocomplete="one-time-code"
        maxlength={6}
        placeholder="123456"
        data-step-focus
        class={`${field} font-mono tracking-[0.3em]`}
      />
    </div>
  {:else}
    <p class="text-sm text-muted-foreground">
      Two-factor authentication is on. Save these backup codes somewhere safe: each one signs you in once if you lose
      your phone. They won't be shown again.
    </p>
    <ul
      class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-card border border-border bg-background-alt p-4 font-mono text-sm text-foreground"
      aria-label="Backup codes"
    >
      {#each backupCodes as backupCode (backupCode)}<li>{backupCode}</li>{/each}
    </ul>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="mt-3"
      onclick={() => copy(backupCodes.join("\n"), "codes")}
    >
      <Icon name={copied === "codes" ? "check" : "copy"} size={14} />
      {copied === "codes" ? "Copied" : "Copy codes"}
    </Button>
  {/if}

  {#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}

  <div class="mt-6 flex justify-end gap-2">
    {#if step === "password"}
      {@render actions?.()}
    {:else if step === "scan"}
      <Button type="button" variant="ghost" onclick={() => go("password")}>Back</Button>
    {/if}
    <Button type="submit" variant="solid" class="px-5" disabled={!canContinue}>
      {#if busy}
        {step === "scan" ? "Verifying…" : "Checking…"}
      {:else}
        {step === "scan" ? "Turn on" : step === "codes" ? "I've saved them" : "Continue"}
      {/if}
    </Button>
  </div>
</form>
