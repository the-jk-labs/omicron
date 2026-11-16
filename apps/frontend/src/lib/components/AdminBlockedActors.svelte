<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import type { BlockedActor } from "#lib/types.js";

  // Remote accounts blocked instance-wide, without cutting off their server.
  // `initial` is the server-loaded list; without it the browser loads it.
  let { initial = null }: { initial?: { actors: BlockedActor[] } | null } = $props();
  const seed = untrack(() => initial);

  let actors = $state<BlockedActor[]>(seed?.actors ?? []);
  let loading = $state(!seed);
  let error = $state("");
  let notice = $state("");

  let account = $state("");
  let reason = $state("");
  let adding = $state(false);
  let busy = $state<string | null>(null);

  async function load() {
    loading = true;
    error = "";
    try {
      actors = (await endpoints().blockedActors()).actors;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to load blocked accounts.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!seed) load();
  });

  async function block() {
    if (!account.trim()) return;
    adding = true;
    error = "";
    notice = "";
    try {
      const { actor } = await endpoints().blockActor(account.trim(), reason.trim() || undefined);
      actors = [...actors.filter((a) => a.apId !== actor.apId), actor].toSorted((a, b) =>
        a.handle.localeCompare(b.handle),
      );
      notice = `Blocked @${actor.handle}. Its cached profile and posts were removed.`;
      account = "";
      reason = "";
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to block the account.";
    } finally {
      adding = false;
    }
  }

  async function unblock(actor: BlockedActor) {
    const { ok } = await confirm({
      title: `Unblock @${actor.handle}?`,
      description: "It can reach this instance again. Nothing removed earlier comes back on its own.",
      confirmText: "Unblock",
    });
    if (!ok) return;
    busy = actor.apId;
    error = "";
    try {
      await endpoints().unblockActor(actor.apId);
      actors = actors.filter((a) => a.apId !== actor.apId);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to unblock.";
    } finally {
      busy = null;
    }
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const labelClass = "text-sm font-medium leading-none";
</script>

<div class="flex flex-col gap-6">
  <form class="flex flex-col gap-3" onsubmit={(e) => (e.preventDefault(), block())}>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="block-account" class={labelClass}>Account</Label.Root>
      <input
        id="block-account"
        bind:value={account}
        placeholder="user@example.social"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        class={field}
      />
      <p class="text-xs text-muted-foreground">
        A handle or a profile link. The block follows the account if it changes its handle.
      </p>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label.Root for="block-account-reason" class={labelClass}>Reason (optional)</Label.Root>
      <input id="block-account-reason" bind:value={reason} maxlength={1000} class={field} />
    </div>
    {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    {#if notice}<p class="text-sm text-muted-foreground">{notice}</p>{/if}
    <div class="flex justify-end">
      <Button variant="destructive" type="submit" disabled={adding || !account.trim()}>
        <Icon name="block" size={15} />
        {adding ? "Blocking…" : "Block account"}
      </Button>
    </div>
  </form>

  <div>
    <h3 class="text-sm font-medium text-foreground">Blocked accounts</h3>
    {#if loading}
      <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
    {:else if actors.length === 0}
      <p class="py-6 text-center text-sm text-muted-foreground">No accounts blocked.</p>
    {:else}
      <ul class="mt-3 flex flex-col divide-y divide-border">
        {#each actors as actor (actor.apId)}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div class="min-w-[14rem] flex-1">
              <p class="truncate font-medium text-foreground">@{actor.handle}</p>
              <p class="truncate text-xs text-muted-foreground">
                {actor.reason ? actor.reason : "No reason given"} · <Time iso={actor.createdAt} kind="date" />
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={busy === actor.apId} onclick={() => unblock(actor)}>
              <Icon name="check" size={15} /> Unblock
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
