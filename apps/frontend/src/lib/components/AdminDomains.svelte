<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import { confirm } from "$lib/components/ui/confirm";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { BlockedDomain } from "$lib/types";

  let domains = $state<BlockedDomain[]>([]);
  let loading = $state(true);
  let error = $state("");

  let domain = $state("");
  let reason = $state("");
  let adding = $state(false);
  let notice = $state("");
  let busyDomain = $state<string | null>(null);

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
    load();
  });

  async function block() {
    error = "";
    notice = "";
    if (!domain.trim()) return;
    adding = true;
    try {
      const res = await endpoints().blockDomain(domain.trim(), reason.trim() || undefined);
      notice = res.purged > 0
        ? `Blocked ${res.domain} and removed ${res.purged} cached ${res.purged === 1 ? "account" : "accounts"}.`
        : `Blocked ${res.domain}.`;
      domain = "";
      reason = "";
      await load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to block domain.";
    } finally {
      adding = false;
    }
  }

  async function unblock(d: BlockedDomain) {
    const ok = await confirm({
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
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
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
      <p class="text-xs text-muted-foreground">
        Blocks the exact host and all its subdomains. Cached content from it is removed.
      </p>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="block-reason" class={labelClass}>Reason (optional)</Label.Root>
      <input id="block-reason" bind:value={reason} maxlength={1000} class={field} />
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    {#if notice}<p class="text-sm text-muted-foreground">{notice}</p>{/if}
    <div class="flex justify-end">
      <Button variant="destructive" disabled={adding || !domain.trim()} type="submit">
        <Icon name="block" size={15} /> {adding ? "Blocking…" : "Block domain"}
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
          <li class="flex items-center gap-3 py-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-foreground">{d.domain}</p>
              <p class="truncate text-xs text-muted-foreground">
                {d.reason ? d.reason : "No reason given"} · {formatDate(d.createdAt)}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={busyDomain === d.domain} onclick={() => unblock(d)}>
              <Icon name="check" size={15} /> Unblock
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
