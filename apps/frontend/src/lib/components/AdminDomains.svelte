<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, RadioGroup } from "bits-ui";
  import { untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import type { BlockedDomain, DomainBlockSeverity } from "#lib/types.js";

  // `initial` is the server-loaded blocklist; without it the browser loads it.
  let { initial = null }: { initial?: { domains: BlockedDomain[] } | null } = $props();
  const seed = untrack(() => initial);

  let domains = $state<BlockedDomain[]>(seed?.domains ?? []);
  let loading = $state(!seed);
  let error = $state("");

  let domain = $state("");
  let reason = $state("");
  let severity = $state<DomainBlockSeverity>("suspend");
  let adding = $state(false);
  let notice = $state("");
  let busyDomain = $state<string | null>(null);

  const SEVERITY = {
    suspend: {
      label: "Suspend",
      body: "Cut it off: inbound activity is dropped, nothing is delivered, and its cached content is removed.",
    },
    limit: {
      label: "Limit",
      body: "Keep federating, but keep it off Global, Trending and auto-caching. Follows and replies still work.",
    },
  } as const;

  async function load() {
    loading = true;
    error = "";
    try {
      const res = await endpoints().blockedDomains();
      domains = res.domains;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to load blocklist.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!seed) load();
  });

  function blockedNotice(res: { domain: string; purged: number }, as: DomainBlockSeverity) {
    if (as === "limit") return `Limited ${res.domain}.`;
    return res.purged > 0
      ? `Blocked ${res.domain} and removed ${res.purged} cached ${res.purged === 1 ? "account" : "accounts"}.`
      : `Blocked ${res.domain}.`;
  }

  async function block() {
    error = "";
    notice = "";
    if (!domain.trim()) return;
    adding = true;
    try {
      const res = await endpoints().blockDomain(
        domain.trim(),
        reason.trim() || undefined,
        severity === "suspend" ? undefined : severity,
      );
      notice = blockedNotice(res, severity);
      domain = "";
      reason = "";
      await load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to block domain.";
    } finally {
      adding = false;
    }
  }

  async function change(d: BlockedDomain, next: DomainBlockSeverity) {
    if (next === "suspend") {
      const { ok } = await confirm({
        title: `Suspend ${d.domain}?`,
        description: "Everything cached from it is removed, and it can no longer reach anyone here.",
        confirmText: "Suspend",
      });
      if (!ok) return;
    }
    busyDomain = d.domain;
    error = "";
    try {
      const res = await endpoints().blockDomain(d.domain, d.reason || undefined, next);
      notice = blockedNotice(res, next);
      domains = domains.map((x) => (x.domain === d.domain ? { ...x, severity: next } : x));
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to update.";
    } finally {
      busyDomain = null;
    }
  }

  async function unblock(d: BlockedDomain) {
    const { ok } = await confirm({
      title: `Unblock ${d.domain}?`,
      description: "This instance will federate with it again. Cached content re-populates on demand.",
      confirmText: "Unblock",
    });
    if (!ok) return;
    busyDomain = d.domain;
    try {
      await endpoints().unblockDomain(d.domain);
      domains = domains.filter((x) => x.domain !== d.domain);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to unblock.";
    } finally {
      busyDomain = null;
    }
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
  const radioItem =
    "flex items-start gap-3 rounded-card border border-border bg-background p-3.5 text-left shadow-btn transition-colors data-[state=checked]:border-foreground hover:border-foreground/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-foreground";
</script>

<div class="flex flex-col gap-6">
  <form class="flex flex-col gap-3" onsubmit={(e) => (e.preventDefault(), block())}>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="block-domain" class={labelClass}>Domain</Label.Root>
      <input
        id="block-domain"
        bind:value={domain}
        placeholder="example.social"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        class={field}
      />
      <p class="text-xs text-muted-foreground">Covers the exact host and all its subdomains.</p>
    </div>
    <RadioGroup.Root bind:value={severity} class="grid gap-3 sm:grid-cols-2" aria-label="Severity">
      {#each ["suspend", "limit"] as const as value (value)}
        <RadioGroup.Item {value} class={radioItem}>
          <div>
            <div class="text-sm font-semibold text-foreground">{SEVERITY[value].label}</div>
            <p class="mt-0.5 text-xs text-muted-foreground">{SEVERITY[value].body}</p>
          </div>
        </RadioGroup.Item>
      {/each}
    </RadioGroup.Root>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="block-reason" class={labelClass}>Reason (optional)</Label.Root>
      <input id="block-reason" bind:value={reason} maxlength={1000} class={field} />
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    {#if notice}<p class="text-sm text-muted-foreground">{notice}</p>{/if}
    <div class="flex justify-end">
      <Button
        variant={severity === "suspend" ? "destructive" : "solid"}
        disabled={adding || !domain.trim()}
        type="submit"
      >
        <Icon name={severity === "suspend" ? "block" : "eye"} size={15} />
        {adding ? "Saving…" : severity === "suspend" ? "Block domain" : "Limit domain"}
      </Button>
    </div>
  </form>

  <div>
    <h3 class="text-sm font-medium text-foreground">Blocked domains</h3>
    {#if loading}
      <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
    {:else if domains.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">No domains blocked.</p>
    {:else}
      <ul class="mt-3 flex flex-col divide-y divide-border">
        {#each domains as d (d.domain)}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div class="min-w-[14rem] flex-1">
              <p class="flex items-center gap-2 truncate font-medium text-foreground">
                {d.domain}
                <span
                  class="rounded-full border px-2 py-0.5 text-xs font-medium {d.severity === 'suspend'
                    ? 'border-destructive/30 text-destructive'
                    : 'border-border text-muted-foreground'}">{d.severity === "suspend" ? "Suspended" : "Limited"}</span
                >
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {d.reason ? d.reason : "No reason given"} · <Time iso={d.createdAt} kind="date" />
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busyDomain === d.domain}
              onclick={() => change(d, d.severity === "suspend" ? "limit" : "suspend")}
            >
              {d.severity === "suspend" ? "Limit instead" : "Suspend instead"}
            </Button>
            <Button variant="outline" size="sm" disabled={busyDomain === d.domain} onclick={() => unblock(d)}>
              <Icon name="check" size={15} /> Unblock
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
