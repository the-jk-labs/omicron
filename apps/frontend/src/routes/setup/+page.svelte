<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { Checkbox, Label, RadioGroup } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import logo from "$lib/assets/omicron.svg";
  import type { EmailInput, InstanceInfo } from "$lib/types";

  // The public domain the layout gate resolved. Prefill it (unless it's the bare
  // localhost dev default) so an operator on a real domain confirms rather than
  // retypes.
  const instance = page.data.instance as InstanceInfo | null;
  const suggestedDomain = instance && !instance.domain.startsWith("localhost")
    ? instance.domain
    : "";

  // Wizard state. Three steps: instance identity → admin account → email.
  let step = $state(0);
  const steps = ["Instance", "Admin", "Email"];

  let appName = $state(instance?.name && instance.name !== "Omicron" ? instance.name : "");
  let appDomain = $state(suggestedDomain);
  let displayName = $state("");
  let username = $state("");
  let email = $state("");
  let password = $state("");

  // Email step. `console` is zero-config; `smtp` collects connection details the
  // operator can verify with a live test before finishing — so they never hand-
  // edit SMTP_* env vars.
  let emailMode = $state<"console" | "smtp">("console");
  let smtpFrom = $state("");
  let smtpHost = $state("");
  let smtpPort = $state(587);
  let smtpUsername = $state("");
  let smtpPassword = $state("");
  let smtpTls = $state(false);

  let testTo = $state("");
  let testState = $state<"idle" | "sending" | "ok" | "error">("idle");
  let testMsg = $state("");

  let error = $state("");
  let busy = $state(false);

  // The email settings payload the wizard submits (and tests). Undefined SMTP
  // fields fall back to any env/default on the backend.
  function emailPayload(): EmailInput {
    if (emailMode === "console") return { mode: "console" };
    return {
      mode: "smtp",
      from: smtpFrom.trim() || undefined,
      smtp: {
        host: smtpHost.trim() || undefined,
        port: smtpPort,
        username: smtpUsername.trim() || undefined,
        password: smtpPassword || undefined,
        tls: smtpTls,
      },
    };
  }

  async function sendTest() {
    testState = "sending";
    testMsg = "";
    try {
      await endpoints().testSetupEmail({
        to: testTo.trim() || email.trim(),
        email: emailPayload(),
      });
      testState = "ok";
      testMsg = "Test email sent — check that inbox to confirm delivery.";
    } catch (err) {
      testState = "error";
      testMsg = err instanceof ApiError ? err.message : "Could not send the test email.";
    }
  }

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";

  // Per-step gating so the operator can't advance past an incomplete step. The
  // backend re-validates authoritatively on submit.
  const canAdvance = $derived(
    step === 0
      ? appName.trim().length > 0
      : step === 1
      ? /^[a-z0-9_]{3,30}$/.test(username.trim().toLowerCase()) &&
        email.includes("@") && password.length >= 8
      : true,
  );

  function next() {
    error = "";
    if (step < steps.length - 1) step += 1;
  }
  function back() {
    error = "";
    if (step > 0) step -= 1;
  }

  async function finish() {
    error = "";
    busy = true;
    try {
      await endpoints().completeSetup({
        appName: appName.trim(),
        appDomain: appDomain.trim() || undefined,
        email: emailPayload(),
        admin: {
          username: username.trim().toLowerCase(),
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        },
      });
      await invalidateAll();
      goto("/");
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Something went wrong.";
      // Field errors (username/email/password) come from the admin step — send
      // the operator back there to fix them.
      if (err instanceof ApiError && err.status === 400) step = 1;
    } finally {
      busy = false;
    }
  }

  const radioItem =
    "flex items-start gap-3 rounded-card border border-border bg-background p-4 text-left shadow-btn transition-colors data-[state=checked]:border-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";
</script>

<svelte:head><title>Set up your instance</title></svelte:head>

<div class="mb-8 text-center">
  <div class="mb-4 flex justify-center"><img src={logo} alt="" class="h-12 w-auto" /></div>
  <h1 class="text-2xl font-bold tracking-tight text-foreground">Welcome — let's set up</h1>
  <p class="mt-1.5 text-sm text-muted-foreground">
    A few details and your instance is live. Nothing to edit on disk.
  </p>
</div>

<!-- Step indicator -->
<ol class="mb-8 flex items-center justify-center gap-2 text-xs font-medium">
  {#each steps as label, i (label)}
    <li class="flex items-center gap-2">
      <span
        class="flex h-6 w-6 items-center justify-center rounded-full border {i <= step
          ? 'border-foreground bg-foreground text-background'
          : 'border-border text-muted-foreground'}"
      >
        {#if i < step}<Icon name="check" class="h-3.5 w-3.5" />{:else}{i + 1}{/if}
      </span>
      <span class={i === step ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      {#if i < steps.length - 1}<span class="mx-1 h-px w-6 bg-border"></span>{/if}
    </li>
  {/each}
</ol>

<div class="flex flex-col gap-4">
  {#if step === 0}
    <div class="flex flex-col gap-1.5">
      <Label.Root for="appName" class={labelClass}>Instance name</Label.Root>
      <input id="appName" bind:value={appName} placeholder="My Blog" class={field} />
      <p class="text-xs text-muted-foreground">The name shown across the site.</p>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="appDomain" class={labelClass}>Public domain <span class="text-muted-foreground">(optional)</span></Label.Root>
      <input id="appDomain" bind:value={appDomain} placeholder="blog.example.com" class={field} />
      <p class="text-xs text-muted-foreground">
        Leave blank for local use. Set it to go public and federate over ActivityPub.
      </p>
    </div>
  {:else if step === 1}
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
      <input id="password" type="password" bind:value={password} autocomplete="new-password" placeholder="min 8 characters" class={field} />
    </div>
    <p class="text-xs text-muted-foreground">This first account is the instance admin.</p>
  {:else}
    <span class={labelClass}>How should the instance send email?</span>
    <RadioGroup.Root bind:value={emailMode} class="flex flex-col gap-3">
      <RadioGroup.Item value="console" class={radioItem}>
        <div>
          <div class="text-sm font-semibold text-foreground">Log to console (default)</div>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Password-reset and verification links are printed to the server log. Perfect to
            get started; no mail server needed.
          </p>
        </div>
      </RadioGroup.Item>
      <RadioGroup.Item value="smtp" class={radioItem}>
        <div>
          <div class="text-sm font-semibold text-foreground">Send real email (SMTP)</div>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Deliver mail to real inboxes via any SMTP server or provider relay (Resend,
            SendGrid, Mailgun, Postmark, your own server…). Test it right here.
          </p>
        </div>
      </RadioGroup.Item>
    </RadioGroup.Root>

    {#if emailMode === "smtp"}
      <div class="flex flex-col gap-4 rounded-card border border-border bg-background-alt p-4">
        <div class="flex flex-col gap-1.5">
          <Label.Root for="smtpFrom" class={labelClass}>From address</Label.Root>
          <input id="smtpFrom" bind:value={smtpFrom} placeholder="Omicron &lt;no-reply@example.com&gt;" class={field} />
        </div>
        <div class="flex gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label.Root for="smtpHost" class={labelClass}>SMTP host</Label.Root>
            <input id="smtpHost" bind:value={smtpHost} placeholder="smtp.example.com" class={field} />
          </div>
          <div class="flex w-24 flex-col gap-1.5">
            <Label.Root for="smtpPort" class={labelClass}>Port</Label.Root>
            <input id="smtpPort" type="number" bind:value={smtpPort} class={field} />
          </div>
        </div>
        <div class="flex gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label.Root for="smtpUsername" class={labelClass}>Username</Label.Root>
            <input id="smtpUsername" bind:value={smtpUsername} autocomplete="off" class={field} />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label.Root for="smtpPassword" class={labelClass}>Password / API key</Label.Root>
            <input id="smtpPassword" type="password" bind:value={smtpPassword} autocomplete="new-password" class={field} />
          </div>
        </div>
        <Checkbox.Root
          bind:checked={smtpTls}
          class="flex items-center gap-2.5 text-sm text-foreground"
        >
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

        <!-- Live delivery test against the details above, before finishing. -->
        <div class="flex flex-col gap-2 border-t border-border pt-3">
          <Label.Root for="testTo" class={labelClass}>Send a test email to</Label.Root>
          <div class="flex gap-2">
            <input
              id="testTo"
              bind:value={testTo}
              placeholder={email || "you@example.com"}
              class="{field} min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              class="h-11 shrink-0"
              disabled={testState === "sending"}
              onclick={sendTest}
            >
              {testState === "sending" ? "Sending…" : "Send test"}
            </Button>
          </div>
          {#if testMsg}
            <p class="text-xs {testState === 'ok' ? 'text-foreground' : 'text-destructive'}">
              {testMsg}
            </p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  <div class="mt-2 flex items-center justify-between gap-3">
    {#if step > 0}
      <Button type="button" variant="outline" class="h-11" onclick={back}>Back</Button>
    {:else}
      <span></span>
    {/if}
    {#if step < steps.length - 1}
      <Button type="button" variant="solid" class="h-11" disabled={!canAdvance} onclick={next}>
        Continue
      </Button>
    {:else}
      <Button type="button" variant="solid" class="h-11" disabled={busy} onclick={finish}>
        {busy ? "Setting up…" : "Finish setup"}
      </Button>
    {/if}
  </div>
</div>
