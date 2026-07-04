<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Checkbox, Label, RadioGroup } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { EmailInput, EmailMode, EmailSettings, EmailDnsRecords, EmailDnsReport } from "$lib/types";

  // Runtime email configuration (services/emailSettings.ts). Four modes:
  //   console · smtp · relay (one API key) · direct (self-host + DKIM/DNS).
  // Secrets are never returned; a blank secret field means "leave unchanged".
  let mode = $state<EmailMode>("console");
  let from = $state("");
  let host = $state("");
  let port = $state(587);
  let username = $state("");
  let password = $state("");
  let tls = $state(false);
  let hasPassword = $state(false);
  let apiKey = $state("");
  let hasApiKey = $state(false);
  let dkimDomain = $state<string | undefined>(undefined);
  let dkimSelector = $state("omicron");
  let hasKey = $state(false);

  let loading = $state(true);
  let saving = $state(false);
  let error = $state("");
  let saved = $state(false);

  // DNS / DKIM setup (Path B).
  let dnsDomain = $state("");
  let records = $state<EmailDnsRecords | null>(null);
  let report = $state<EmailDnsReport | null>(null);
  let generating = $state(false);
  let verifying = $state(false);
  let dnsError = $state("");

  // Outbound port-25 preflight (direct mode viability on this host).
  let port25 = $state<{ ok: boolean; detail: string } | null>(null);
  let checkingPort = $state(false);

  let testTo = $state("");
  let testState = $state<"idle" | "sending" | "ok" | "error">("idle");
  let testMsg = $state("");

  let copied = $state("");

  // Common SMTP providers, so the operator picks one and only fills credentials.
  const presets: Record<string, { host: string; port: number; tls: boolean; username?: string; note: string }> = {
    Resend: { host: "smtp.resend.com", port: 587, tls: false, username: "resend", note: "Password = your Resend API key." },
    SendGrid: { host: "smtp.sendgrid.net", port: 587, tls: false, username: "apikey", note: "Username is literally 'apikey'; password = your API key." },
    Mailgun: { host: "smtp.mailgun.org", port: 587, tls: false, note: "Username/password from your Mailgun domain's SMTP credentials." },
    Postmark: { host: "smtp.postmarkapp.com", port: 587, tls: false, note: "Username and password are both your Server API token." },
    Brevo: { host: "smtp-relay.brevo.com", port: 587, tls: false, note: "Use the SMTP key from Brevo (not your login password)." },
    Gmail: { host: "smtp.gmail.com", port: 587, tls: false, note: "Use an App Password, not your account password." },
  };
  let presetNote = $state("");

  function applyPreset(name: string) {
    const p = presets[name];
    if (!p) return;
    host = p.host;
    port = p.port;
    tls = p.tls;
    if (p.username) username = p.username;
    presetNote = p.note;
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => (copied === key ? (copied = "") : null), 1500);
    } catch { /* clipboard unavailable */ }
  }

  async function checkPort() {
    checkingPort = true;
    try {
      port25 = await endpoints().checkPort25();
    } catch (e) {
      port25 = { ok: false, detail: e instanceof ApiError ? e.message : "Check failed." };
    } finally {
      checkingPort = false;
    }
  }

  const field =
    "h-11 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none text-foreground";
  const radioItem =
    "flex items-start gap-3 rounded-card border border-border bg-background p-3.5 text-left shadow-btn transition-colors data-[state=checked]:border-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";

  function domainFromAddress(addr: string): string {
    const m = addr.match(/<([^>]+)>/);
    return (m ? m[1] : addr).split("@")[1]?.trim() ?? "";
  }

  function apply(s: EmailSettings) {
    mode = s.mode;
    from = s.from;
    host = s.smtp.host ?? "";
    port = s.smtp.port;
    username = s.smtp.username ?? "";
    tls = s.smtp.tls;
    hasPassword = s.smtp.hasPassword;
    hasApiKey = s.relay.hasApiKey;
    dkimDomain = s.dkim.domain;
    dkimSelector = s.dkim.selector;
    hasKey = s.dkim.hasKey;
    password = "";
    apiKey = "";
    if (!dnsDomain) dnsDomain = s.dkim.domain ?? domainFromAddress(s.from);
  }

  $effect(() => {
    endpoints()
      .adminEmail()
      .then(apply)
      .catch((e) => (error = e instanceof ApiError ? e.message : "Failed to load settings."))
      .finally(() => (loading = false));
  });

  function payload(): EmailInput {
    const base: EmailInput = { mode, from: from.trim() || undefined };
    if (mode === "smtp") {
      base.smtp = {
        host: host.trim() || undefined,
        port,
        username: username.trim() || undefined,
        password: password || undefined,
        tls,
      };
    } else if (mode === "relay") {
      base.relay = { provider: "resend", apiKey: apiKey || undefined };
    }
    return base;
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

  async function generate() {
    generating = true;
    dnsError = "";
    report = null;
    try {
      const r = await endpoints().generateDkim(dnsDomain.trim());
      records = r.records;
      dkimDomain = r.domain;
      dkimSelector = r.selector;
      hasKey = true;
    } catch (e) {
      dnsError = e instanceof ApiError ? e.message : "Could not generate DKIM keys.";
    } finally {
      generating = false;
    }
  }

  async function verify() {
    verifying = true;
    dnsError = "";
    try {
      const r = await endpoints().checkEmailDns();
      records = r.records;
      report = r.report;
    } catch (e) {
      dnsError = e instanceof ApiError ? e.message : "Could not check DNS.";
    } finally {
      verifying = false;
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

  // Records to display, paired with their live status when a report exists.
  const recordRows = $derived(
    records
      ? [
        { key: "dkim", rec: records.dkim, c: report?.dkim },
        { key: "spf", rec: records.spf, c: report?.spf },
        { key: "dmarc", rec: records.dmarc, c: report?.dmarc },
      ]
      : [],
  );
</script>

<div class="flex flex-col gap-5">
  <RadioGroup.Root bind:value={mode} class="grid gap-3 sm:grid-cols-2">
    <RadioGroup.Item value="console" class={radioItem}>
      <div>
        <div class="text-sm font-semibold text-foreground">Console (default)</div>
        <p class="mt-0.5 text-xs text-muted-foreground">Log links to the server — zero config.</p>
      </div>
    </RadioGroup.Item>
    <RadioGroup.Item value="smtp" class={radioItem}>
      <div>
        <div class="text-sm font-semibold text-foreground">SMTP server</div>
        <p class="mt-0.5 text-xs text-muted-foreground">Any SMTP server or provider endpoint.</p>
      </div>
    </RadioGroup.Item>
    <RadioGroup.Item value="relay" class={radioItem}>
      <div>
        <div class="text-sm font-semibold text-foreground">API relay (easiest)</div>
        <p class="mt-0.5 text-xs text-muted-foreground">Paste one provider API key (Resend).</p>
      </div>
    </RadioGroup.Item>
    <RadioGroup.Item value="direct" class={radioItem}>
      <div>
        <div class="text-sm font-semibold text-foreground">Self-hosted (direct)</div>
        <p class="mt-0.5 text-xs text-muted-foreground">Send straight to recipients, DKIM-signed.</p>
      </div>
    </RadioGroup.Item>
  </RadioGroup.Root>

  {#if mode !== "console"}
    <div class="flex flex-col gap-1.5">
      <Label.Root for="email-from" class={labelClass}>From address</Label.Root>
      <input id="email-from" bind:value={from} placeholder="Omicron &lt;no-reply@example.com&gt;" class={field} />
    </div>
  {/if}

  {#if mode === "smtp"}
    <div class="flex flex-col gap-4 rounded-card border border-border bg-background-alt p-4">
      <div class="flex flex-col gap-1.5">
        <Label.Root for="email-preset" class={labelClass}>Provider preset</Label.Root>
        <select
          id="email-preset"
          onchange={(e) => applyPreset((e.currentTarget as HTMLSelectElement).value)}
          class="{field} appearance-none"
        >
          <option value="">Choose a provider to auto-fill…</option>
          {#each Object.keys(presets) as name (name)}<option value={name}>{name}</option>{/each}
        </select>
        {#if presetNote}<p class="text-xs text-muted-foreground">{presetNote}</p>{/if}
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
  {:else if mode === "relay"}
    <div class="flex flex-col gap-3 rounded-card border border-border bg-background-alt p-4">
      <div class="flex flex-col gap-1.5">
        <Label.Root for="email-apikey" class={labelClass}>Resend API key</Label.Root>
        <input
          id="email-apikey"
          type="password"
          bind:value={apiKey}
          autocomplete="new-password"
          placeholder={hasApiKey ? "•••••••• (unchanged)" : "re_..."}
          class={field}
        />
        <p class="text-xs text-muted-foreground">
          Create a key at resend.com. To send from your own domain, verify it there (their
          dashboard shows the DNS records); until then you can send from their test domain.
        </p>
      </div>
    </div>
  {:else if mode === "direct"}
    <div class="flex flex-col gap-3 rounded-card border border-border bg-background-alt p-4">
      <p class="text-sm text-muted-foreground">
        Self-hosted delivery sends straight to each recipient's mail server, signed with your DKIM
        key — no third party. It needs the DNS records below published and outbound port 25 open on
        this host (many providers block it). Check that first:
      </p>
      <div class="flex items-center gap-3">
        <Button type="button" variant="outline" class="h-10" disabled={checkingPort} onclick={checkPort}>
          {checkingPort ? "Checking…" : "Check port 25"}
        </Button>
        {#if port25}
          <span class="inline-flex items-center gap-1.5 text-sm {port25.ok ? 'text-foreground' : 'text-destructive'}">
            <Icon name={port25.ok ? "check" : "flag"} size={15} />
            {port25.ok ? "Outbound SMTP works" : "Port 25 blocked"}
          </span>
        {/if}
      </div>
      {#if port25}<p class="text-xs text-muted-foreground">{port25.detail}</p>{/if}
    </div>
  {/if}

  <div class="flex items-center gap-3">
    <Button type="button" variant="solid" class="h-11" disabled={loading || saving} onclick={save}>
      {saving ? "Saving…" : "Save changes"}
    </Button>
    {#if saved}<span class="text-sm text-muted-foreground">Saved.</span>{/if}
  </div>
  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  <!-- DNS / DKIM setup (Path B). Also useful to DKIM-sign the SMTP path. -->
  {#if mode === "direct" || mode === "smtp"}
    <div class="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <h3 class="text-sm font-semibold text-foreground">Sending domain (DKIM / SPF / DMARC)</h3>
        <p class="mt-0.5 text-xs text-muted-foreground">
          Generate a signing key, publish the three records, then verify — email is healthy once
          DKIM and SPF check out.
        </p>
      </div>
      <div class="flex gap-2">
        <input bind:value={dnsDomain} placeholder="example.com" class="{field} min-w-0 flex-1" />
        <Button type="button" variant="outline" class="h-11 shrink-0" disabled={generating || !dnsDomain.trim()} onclick={generate}>
          {generating ? "Generating…" : hasKey ? "Regenerate" : "Generate keys"}
        </Button>
        <Button type="button" variant="outline" class="h-11 shrink-0" disabled={verifying || !hasKey} onclick={verify}>
          {verifying ? "Checking…" : "Verify DNS"}
        </Button>
      </div>

      {#if records}
        <div class="overflow-x-auto rounded-card border border-border">
          <table class="w-full text-left text-xs">
            <thead class="bg-muted text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">Host</th>
                <th class="px-3 py-2 font-medium">Type</th>
                <th class="px-3 py-2 font-medium">Value</th>
                {#if report}<th class="px-3 py-2 font-medium">Status</th>{/if}
              </tr>
            </thead>
            <tbody class="font-mono">
              {#each recordRows as row (row.key)}
                <tr class="border-t border-border align-top">
                  <td class="whitespace-nowrap px-3 py-2 text-foreground">
                    <button type="button" class="hover:text-foreground-alt" title="Copy host" onclick={() => copy(row.rec.host, row.key + "-h")}>
                      {copied === row.key + "-h" ? "copied ✓" : row.rec.host}
                    </button>
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">{row.rec.type}</td>
                  <td class="max-w-[22rem] break-all px-3 py-2 text-foreground">
                    <button type="button" class="text-left hover:text-foreground-alt" title="Copy value" onclick={() => copy(row.rec.value, row.key + "-v")}>
                      {copied === row.key + "-v" ? "copied ✓" : row.rec.value}
                    </button>
                  </td>
                  {#if report}
                    <td class="px-3 py-2">
                      {#if row.c?.ok}
                        <span class="inline-flex items-center gap-1 text-foreground"><Icon name="check" size={14} /> ok</span>
                      {:else}
                        <span class="text-destructive">missing</span>
                      {/if}
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      {#if report}
        <p class="text-sm {report.healthy ? 'text-foreground' : 'text-muted-foreground'}">
          {report.healthy
            ? "DNS looks healthy — DKIM and SPF are published."
            : "Not healthy yet: publish the records above (DNS can take a while to propagate), then verify again."}
        </p>
      {/if}
      {#if dnsError}<p class="text-sm text-destructive">{dnsError}</p>{/if}
    </div>
  {/if}

  <!-- Live delivery test against the SAVED settings. -->
  <div class="flex flex-col gap-2 border-t border-border pt-4">
    <Label.Root for="email-test-to" class={labelClass}>Send a test email to</Label.Root>
    <div class="flex gap-2">
      <input id="email-test-to" bind:value={testTo} placeholder="you@example.com" class="{field} min-w-0 flex-1" />
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
