<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, RadioGroup } from "bits-ui";
  import { onMount } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { AccessRule, AccessRuleInput, AccessRuleTest } from "#lib/types.js";

  let { managed }: { managed: boolean } = $props();
  let rules = $state<AccessRule[]>([]);
  let loading = $state(true);
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let network = $state("");
  let action = $state("block");
  let duration = $state("24");
  let reason = $state("");
  let testIp = $state("");
  let testPath = $state("/");
  let testing = $state(false);
  let result = $state<AccessRuleTest | null>(null);
  let now = $state(Date.now());
  const durations = [
    { value: "1", label: "1 hour" },
    { value: "24", label: "24 hours" },
    { value: "168", label: "7 days" },
    { value: "720", label: "30 days" },
  ];
  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const radio =
    "border-border-input bg-background hover:border-dark-40 data-[state=checked]:border-foreground data-[state=checked]:border-6 size-5 shrink-0 cursor-default rounded-full border transition-all duration-100 ease-in-out";

  function failure(e: unknown) {
    return e instanceof ApiError ? e.message : "Could not update IP rules.";
  }

  async function load() {
    loading = true;
    error = "";
    try {
      rules = (await endpoints().accessRules()).rules;
      loaded = true;
    } catch (e) {
      error = failure(e);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    network;
    action;
    testIp;
    testPath;
    result = null;
  });

  async function add() {
    busy = true;
    error = "";
    notice = "";
    try {
      rules = (
        await endpoints().addAccessRule({
          network: network.trim(),
          action: action as AccessRuleInput["action"],
          reason: reason.trim(),
          expiresInHours: Number(duration) as AccessRuleInput["expiresInHours"],
        })
      ).rules;
      network = "";
      reason = "";
      result = null;
      notice = "IP rule applied. It expires automatically.";
    } catch (e) {
      error = failure(e);
    } finally {
      busy = false;
    }
  }

  async function change(rule: AccessRule, remove = false) {
    busy = true;
    error = "";
    notice = "";
    try {
      rules = (
        await (remove
          ? endpoints().removeAccessRule(rule.id)
          : endpoints().setAccessRuleEnabled(rule.id, !rule.enabled))
      ).rules;
      result = null;
      notice = remove ? "IP rule removed." : "IP rule updated.";
    } catch (e) {
      error = failure(e);
    } finally {
      busy = false;
    }
  }

  async function preview(draft = false) {
    testing = true;
    error = "";
    result = null;
    const snapshot = { ip: testIp.trim(), path: testPath, network: network.trim(), action };
    try {
      const response = await endpoints().testAccessRules(
        snapshot.ip,
        snapshot.path,
        draft ? { network: snapshot.network, action: snapshot.action as AccessRuleInput["action"] } : undefined,
      );
      if (
        testIp.trim() === snapshot.ip &&
        testPath === snapshot.path &&
        network.trim() === snapshot.network &&
        action === snapshot.action
      )
        result = response;
    } catch (e) {
      error = failure(e);
    } finally {
      testing = false;
    }
  }
</script>

<section class="flex flex-col gap-5" aria-labelledby="ip-rules-heading">
  <div>
    <h3 id="ip-rules-heading" class="text-sm font-semibold text-foreground">IP access rules</h3>
    <p class="mt-1 max-w-prose text-sm text-muted-foreground">
      Temporarily allow or block an IP address or range on web pages. Rules apply even when the challenge switch is off.
      The first active match wins, newest first. Allow bypasses Anubis, not sign-in or rate limits.
    </p>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
      API, federation, feeds, sitemaps, and sign-in/admin recovery paths are exempt. A block is not a host firewall ban.
      Addresses are the peers connecting directly to Caddy; do not use these rules behind another proxy or CDN. Use a
      single address when possible: a range may affect many readers sharing a network.
    </p>
    {#if !managed}<p class="mt-2 text-sm text-muted-foreground">
        A managed Caddy deployment is required to change IP rules.
      </p>{/if}
  </div>

  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
  {#if notice}<p role="status" class="text-sm text-muted-foreground">{notice}</p>{/if}
  {#if loading}
    <p class="text-sm text-muted-foreground">Loading IP rules…</p>
  {:else if !loaded}
    <Button variant="outline" onclick={load}>Retry loading IP rules</Button>
  {:else}
    {#if rules.length === 0}<p class="text-sm text-muted-foreground">No custom IP rules.</p>{/if}
    <ul class="flex flex-col divide-y divide-border">
      {#each rules as rule (rule.id)}
        {@const expired = Date.parse(rule.expiresAt) <= now}
        <li class="flex flex-wrap items-center gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium break-all text-foreground">
              {rule.action === "allow" ? "Allow" : "Block"}
              {rule.network}
            </p>
            <p class="text-xs text-muted-foreground">
              {expired ? "Expired" : !rule.enabled ? "Disabled" : "Active"} · Expires <Time iso={rule.expiresAt} />
            </p>
            {#if rule.reason}<p class="text-sm break-words text-muted-foreground">{rule.reason}</p>{/if}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!managed || busy || testing || expired}
            aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.network}`}
            onclick={() => change(rule)}>{rule.enabled ? "Disable" : "Enable"}</Button
          >
          <Button
            variant="outline"
            size="sm"
            disabled={!managed || busy || testing}
            aria-label={`Remove ${rule.network}`}
            onclick={() => change(rule, true)}>Remove</Button
          >
        </li>
      {/each}
    </ul>

    <form
      class="flex flex-col gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <h4 class="text-sm font-medium text-foreground">Add temporary rule</h4>
      <Label.Root for="access-network" class="text-sm font-medium text-foreground">IP address or CIDR range</Label.Root>
      <input
        id="access-network"
        bind:value={network}
        required
        maxlength={64}
        placeholder="192.0.2.10 or 2001:db8::/64"
        autocomplete="off"
        spellcheck="false"
        class={field}
        disabled={!managed || busy}
      />
      <RadioGroup.Root
        bind:value={action}
        disabled={!managed || busy}
        aria-label="Rule action"
        class="flex flex-col gap-4 text-sm font-medium"
      >
        {#each [{ value: "block", label: "Block web pages (403)" }, { value: "allow", label: "Allow without an Anubis challenge" }] as option (option.value)}
          <div class="group flex items-center text-foreground transition-all select-none">
            <RadioGroup.Item id={`access-${option.value}`} value={option.value} class={radio} />
            <Label.Root for={`access-${option.value}`} class="pl-3">{option.label}</Label.Root>
          </div>
        {/each}
      </RadioGroup.Root>
      <RadioGroup.Root
        bind:value={duration}
        disabled={!managed || busy}
        aria-label="Rule expiry"
        class="flex flex-col gap-4 text-sm font-medium"
      >
        {#each durations as option (option.value)}
          <div class="group flex items-center text-foreground transition-all select-none">
            <RadioGroup.Item id={`access-expiry-${option.value}`} value={option.value} class={radio} />
            <Label.Root for={`access-expiry-${option.value}`} class="pl-3">{option.label}</Label.Root>
          </div>
        {/each}
      </RadioGroup.Root>
      <Label.Root for="access-reason" class="text-sm font-medium text-foreground">Reason (optional)</Label.Root>
      <input id="access-reason" bind:value={reason} maxlength={300} class={field} disabled={!managed || busy} />
      <div>
        <Button type="submit" variant="solid" disabled={!managed || busy || testing || !network.trim()}
          >{busy ? "Applying…" : "Apply rule"}</Button
        >
      </div>
    </form>

    <form
      class="flex flex-col gap-3"
      onsubmit={(e) => {
        e.preventDefault();
        void preview();
      }}
    >
      <h4 class="text-sm font-medium text-foreground">Test an IP and path</h4>
      <p class="text-sm text-muted-foreground">
        Check saved rules, or preview the new rule above before applying it. This does not simulate Anubis's built-in
        bot policy.
      </p>
      <Label.Root for="access-test-ip" class="text-sm font-medium text-foreground">Visitor IP address</Label.Root>
      <input id="access-test-ip" bind:value={testIp} required maxlength={64} placeholder="192.0.2.10" class={field} />
      <Label.Root for="access-test-path" class="text-sm font-medium text-foreground">URL path</Label.Root>
      <input
        id="access-test-path"
        bind:value={testPath}
        required
        maxlength={2048}
        placeholder="/search"
        class={field}
      />
      <div class="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={testing || busy || !testIp.trim()}>Test saved rules</Button>
        <Button
          type="button"
          variant="outline"
          disabled={testing || busy || !testIp.trim() || !network.trim()}
          onclick={() => preview(true)}>Test draft rule</Button
        >
      </div>
      {#if result}<p role="status" class="text-sm text-foreground">
          {result.ruleId === "draft" ? "Draft: " : ""}{result.message}
        </p>{/if}
    </form>
  {/if}
</section>
