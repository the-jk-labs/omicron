<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Change the login email: password → new address → code sent to it. The old
     address keeps working until the code is confirmed, then gets a notice with
     an undo link (server side, see auth/auth.ts). -->
<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { Dialog, Label } from "bits-ui";
  import { tick } from "svelte";
  import { prefersReducedMotion } from "svelte/motion";
  import { fly } from "svelte/transition";
  import { authClient } from "#lib/auth-client.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { emailChangeError, needsPassword, rememberNewLogin } from "#lib/emailChange.js";
  import { confirmPassword } from "#lib/passkeys.js";
  import { notALoginField } from "#lib/passwordManagers.js";

  let {
    open = $bindable(false),
    username,
    email,
    displayName,
  }: { open?: boolean; username: string; email: string; displayName: string } = $props();

  type Step = "password" | "email" | "code" | "done";
  const STEP_NUMBER: Record<Step, number> = { password: 1, email: 2, code: 3, done: 3 };
  const RESEND_AFTER_S = 30;

  let step = $state<Step>("password");
  let password = $state("");
  let newEmail = $state("");
  let sentTo = $state("");
  let code = $state("");
  let error = $state("");
  let busy = $state(false);
  let resendIn = $state(0);
  let resendTimer: ReturnType<typeof setInterval> | undefined;
  let content = $state<HTMLElement | null>(null);
  let height = $state(0);

  const field =
    "h-11 w-full rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";
  const duration = $derived(prefersReducedMotion.current ? 0 : 200);

  function reset() {
    step = "password";
    password = newEmail = sentTo = code = error = "";
    busy = false;
    clearInterval(resendTimer);
    resendIn = 0;
  }

  function onOpenChange(next: boolean) {
    open = next;
    if (!next) reset();
  }

  async function go(next: Step) {
    step = next;
    await tick();
    content?.querySelector<HTMLElement>("[data-step-focus]")?.focus();
  }

  function startCooldown() {
    clearInterval(resendTimer);
    resendIn = RESEND_AFTER_S;
    resendTimer = setInterval(() => {
      resendIn -= 1;
      if (resendIn <= 0) clearInterval(resendTimer);
    }, 1000);
  }

  async function confirm() {
    const failed = await confirmPassword(username, password);
    if (failed) {
      error = failed;
      return;
    }
    await go("email");
  }

  // The server re-checks how fresh the password confirmation is on every step.
  async function backToPassword() {
    password = "";
    error = "It's been a while. Confirm your password again to continue.";
    await go("password");
  }

  async function sendCode(to: string) {
    const res = await authClient.emailOtp.requestEmailChange({ newEmail: to });
    if (res.error) {
      if (needsPassword(res.error)) await backToPassword();
      else error = emailChangeError(res.error);
      return false;
    }
    startCooldown();
    return true;
  }

  async function requestCode() {
    const to = newEmail.trim().toLowerCase();
    if (to === email.toLowerCase()) {
      error = "That's already your email.";
      return;
    }
    if (!(await sendCode(to))) return;
    sentTo = to;
    code = "";
    await go("code");
  }

  async function verify() {
    const res = await authClient.emailOtp.changeEmail({ newEmail: sentTo, otp: code });
    if (res.error) {
      if (needsPassword(res.error)) await backToPassword();
      else error = emailChangeError(res.error);
      return;
    }
    await authClient.revokeOtherSessions().catch(() => {});
    await rememberNewLogin(sentTo, password, displayName);
    password = "";
    await refreshAll();
    await go("done");
  }

  async function resend() {
    error = "";
    busy = true;
    await sendCode(sentTo);
    busy = false;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (step === "done") return onOpenChange(false);
    error = "";
    busy = true;
    try {
      if (step === "password") await confirm();
      else if (step === "email") await requestCode();
      else await verify();
    } catch (err) {
      error = err instanceof Error ? err.message : "Something went wrong. Try again.";
    } finally {
      busy = false;
    }
  }

  const canContinue = $derived(
    !busy &&
      ((step === "password" && !!password) ||
        (step === "email" && !!newEmail.trim()) ||
        (step === "code" && code.length === 6) ||
        step === "done"),
  );
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      bind:ref={content}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        content?.querySelector<HTMLElement>("[data-step-focus]")?.focus();
      }}
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]"
    >
      <form onsubmit={submit}>
        <!-- What password managers read on submit: this account's login, which
             becomes the new address once there is one, plus the password below. -->
        <input
          type="email"
          name="username"
          autocomplete="username"
          value={sentTo || email}
          readonly
          tabindex="-1"
          aria-hidden="true"
          class="sr-only"
        />

        <div class="flex items-start justify-between gap-4">
          <div>
            <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Change email</Dialog.Title>
            {#if step !== "done"}
              <p class="mt-0.5 text-xs text-muted-foreground">Step {STEP_NUMBER[step]} of 3</p>
            {/if}
          </div>
          <Dialog.Close class="text-muted-foreground hover:text-foreground" aria-label="Close">
            <Icon name="close" size={18} />
          </Dialog.Close>
        </div>

        <div
          class="overflow-hidden transition-[height] duration-200 ease-out motion-reduce:transition-none"
          style:height={height ? `${height}px` : undefined}
        >
          <div bind:clientHeight={height} class="pt-3">
            {#key step}
              <div in:fly={{ x: 24, duration }}>
                {#if step === "password"}
                  <Dialog.Description class="text-sm text-muted-foreground">
                    First, confirm it's you with your password.
                  </Dialog.Description>
                {:else if step === "email"}
                  <Dialog.Description class="text-sm text-muted-foreground">
                    Enter your new email. We'll send a 6-digit code to it. Your current address keeps working until you
                    confirm.
                  </Dialog.Description>
                  <div class="mt-4 flex flex-col gap-1.5">
                    <Label.Root for="change-email-new" class={labelClass}>New email</Label.Root>
                    <input
                      id="change-email-new"
                      type="email"
                      bind:value={newEmail}
                      autocomplete="off"
                      {...notALoginField}
                      placeholder="you@example.com"
                      data-step-focus
                      class={field}
                    />
                  </div>
                {:else if step === "code"}
                  <Dialog.Description class="text-sm text-muted-foreground">
                    Enter the code we sent to <strong class="font-medium text-foreground">{sentTo}</strong>. It expires
                    in 10 minutes.
                  </Dialog.Description>
                  <div class="mt-4 flex flex-col gap-1.5">
                    <Label.Root for="change-email-code" class={labelClass}>Code</Label.Root>
                    <input
                      id="change-email-code"
                      bind:value={code}
                      oninput={() => (code = code.replace(/\D/g, "").slice(0, 6))}
                      inputmode="numeric"
                      autocomplete="one-time-code"
                      maxlength={6}
                      placeholder="123456"
                      data-step-focus
                      class={`${field} font-mono tracking-[0.3em]`}
                    />
                    <p class="text-xs text-muted-foreground">
                      Didn't get it?
                      {#if resendIn > 0}
                        Send again in {resendIn}s.
                      {:else}
                        <button
                          type="button"
                          onclick={resend}
                          disabled={busy}
                          class="font-medium text-foreground underline underline-offset-4 hover:text-foreground/80 disabled:opacity-60"
                        >
                          Send again
                        </button>
                      {/if}
                    </p>
                  </div>
                {:else}
                  <div class="flex items-start gap-3">
                    <span
                      class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
                    >
                      <Icon name="check" size={20} />
                    </span>
                    <Dialog.Description class="text-sm text-muted-foreground">
                      Your login email is now <strong class="font-medium text-foreground">{sentTo}</strong>. Other
                      devices were signed out, and {email} got a notice with a link to undo this in case it wasn't you.
                    </Dialog.Description>
                  </div>
                {/if}
              </div>
            {/key}

            <!-- Kept in the form through every step so a password manager sees it
                 beside the new email when the change is submitted. -->
            <div
              class={step === "password" ? "mt-4 flex flex-col gap-1.5" : "sr-only"}
              inert={step !== "password"}
              aria-hidden={step !== "password"}
            >
              <Label.Root for="change-email-password" class={labelClass}>Password</Label.Root>
              <input
                id="change-email-password"
                type="password"
                name="password"
                bind:value={password}
                autocomplete="current-password"
                data-step-focus={step === "password" ? "" : undefined}
                class={field}
              />
            </div>

            {#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          {#if step === "code"}
            <Button type="button" variant="ghost" onclick={() => ((error = ""), go("email"))}>Back</Button>
          {:else if step !== "done"}
            <Dialog.Close
              type="button"
              class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
            >
              Cancel
            </Dialog.Close>
          {/if}
          <Button type="submit" variant="solid" class="px-5" disabled={!canContinue}>
            {#if busy}
              {step === "code" ? "Verifying…" : step === "email" ? "Sending…" : "Checking…"}
            {:else}
              {step === "code" ? "Verify" : step === "done" ? "Done" : "Continue"}
            {/if}
          </Button>
        </div>
      </form>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
