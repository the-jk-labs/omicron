<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Checkbox, Label, Switch } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { EmailInput, EmailSettings } from "$lib/types";

  // Runtime email configuration (see services/emailSettings.ts). Loads the stored
  // settings, saves changes, and sends a live test — so email is managed entirely
  // from the web. The password is never returned; an empty field leaves it
  // unchanged. Admin-only (mounted from the admin page).
  let smtp = $state(false); // false = console, true = smtp
  let from = $state("");
  let host = $state("");
  let port = $state(587);
  let username = $state("");
  let password = $state("");
  let tls = $state(false);
  let hasPassword = $state(false);

  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);

  let testTo = $state("");
  let testState = $state<"idle" | "sending" | "ok" | "error">("idle");
  let testMsg = $state("");

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  function apply(s: EmailSettings) {
    smtp = s.mode === "smtp";
    from = s.from;
    host = s.smtp.host ?? "";
    port = s.smtp.port;
    username = s.smtp.username ?? "";
    tls = s.smtp.tls;
    hasPassword = s.smtp.hasPassword;
    password = "";
  }

  $effect(() => {
    endpoints()
      .adminEmail()
      .then(apply)
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  function payload(): EmailInput {
    if (!smtp) return { mode: "console" };
    return {
      mode: "smtp",
      from: from.trim() || undefined,
      smtp: {
        host: host.trim() || undefined,
        port,
        username: username.trim() || undefined,
        // Blank leaves the stored password untouched.
        password: password || undefined,
        tls,
      },
    };
  }

  async function save() {
    saving = true;
    error = "";
    saved = false;
    try {
      apply(await endpoints().setAdminEmail(payload()));
      saved = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to save.";
    } finally {
      saving = false;
    }
  }

  async function sendTest() {
    testState = "sending";
    testMsg = "";
    try {
      await endpoints().testAdminEmail(testTo.trim());
      testState = "ok";
      testMsg = "Test email sent — check that inbox to confirm delivery.";
    } catch (e) {
      testState = "error";
      testMsg = e instanceof ApiError ? e.message : "Could not send the test email.";
    }
  }
</script>

<div class="flex flex-col gap-5">
  <div class="flex items-start justify-between gap-4">
    <div class="flex flex-col gap-1">
      <Label.Root for="email-smtp" class={labelClass}>Send real email (SMTP)</Label.Root>
      <p class="max-w-prose text-sm text-muted-foreground">
        Off logs reset/verification links to the server console (zero config). On delivers via any
        SMTP server or provider relay (Resend, SendGrid, Mailgun, Postmark…).
      </p>
    </div>
    <Switch.Root
      id="email-smtp"
      bind:checked={smtp}
      disabled={loading}
      class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
    >
      <Switch.Thumb
        class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
      />
    </Switch.Root>
  </div>

  {#if smtp}
    <div class="flex flex-col gap-4 rounded-card border border-border bg-background-alt p-4">
      <div class="flex flex-col gap-1.5">
        <Label.Root for="email-from" class={labelClass}>From address</Label.Root>
        <input id="email-from" bind:value={from} placeholder="Omicron &lt;no-reply@example.com&gt;" class={field} />
      </div>
      <div class="flex gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label.Root for="email-host" class={labelClass}>SMTP host</Label.Root>
          <input id="email-host" bind:value={host} placeholder="smtp.example.com" class={field} />
        </div>
        <div class="flex w-24 flex-col gap-1.5">
          <Label.Root for="email-port" class={labelClass}>Port</Label.Root>
          <input id="email-port" type="number" bind:value={port} class={field} />
        </div>
      </div>
      <div class="flex gap-3">
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label.Root for="email-username" class={labelClass}>Username</Label.Root>
          <input id="email-username" bind:value={username} autocomplete="off" class={field} />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label.Root for="email-password" class={labelClass}>Password / API key</Label.Root>
          <input
            id="email-password"
            type="password"
            bind:value={password}
            autocomplete="new-password"
            placeholder={hasPassword ? "•••••••• (unchanged)" : ""}
            class={field}
          />
        </div>
      </div>
      <Checkbox.Root bind:checked={tls} class="flex items-center gap-2.5 text-sm text-foreground">
        {#snippet children({ checked })}
          <span
            class="flex size-5 items-center justify-center rounded-9px border border-border-input bg-background shadow-btn {checked
              ? 'border-foreground bg-foreground text-background'
              : ''}"
          >
            {#if checked}<Icon name="check" class="h-3.5 w-3.5" />{/if}
          </span>
          Use implicit TLS (port 465). Leave off for STARTTLS (587).
        {/snippet}
      </Checkbox.Root>
    </div>
  {/if}

  <div class="flex items-center gap-3">
    <Button type="button" variant="solid" class="h-11" disabled={loading || saving} onclick={save}>
      {saving ? "Saving…" : "Save changes"}
    </Button>
    {#if saved}<span class="text-sm text-muted-foreground">Saved.</span>{/if}
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  <!-- Live delivery test against the SAVED settings. -->
  <div class="flex flex-col gap-2 border-t border-border pt-4">
    <Label.Root for="email-test-to" class={labelClass}>Send a test email to</Label.Root>
    <div class="flex gap-2">
      <input
        id="email-test-to"
        bind:value={testTo}
        placeholder="you@example.com"
        class="{field} min-w-0 flex-1"
      />
      <Button
        type="button"
        variant="outline"
        class="h-11 shrink-0"
        disabled={testState === 'sending' || !testTo.trim()}
        onclick={sendTest}
      >
        {testState === "sending" ? "Sending…" : "Send test"}
      </Button>
    </div>
    <p class="text-xs text-muted-foreground">Tests the currently saved settings — save first.</p>
    {#if testMsg}
      <p class="text-xs {testState === 'ok' ? 'text-foreground' : 'text-destructive'}">{testMsg}</p>
    {/if}
  </div>
</div>
