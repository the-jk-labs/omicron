<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import { confirm } from "$lib/components/ui/confirm";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { AdminUser } from "$lib/types";

  // The signed-in admin's own id, so the row for self can hide the suspend
  // action (the server also forbids it).
  let { selfId }: { selfId: string } = $props();

  let users = $state<AdminUser[]>([]);
  let loading = $state(true);
  let error = $state("");
  let query = $state("");
  let busyId = $state<string | null>(null);

  async function load() {
    loading = true;
    error = "";
    try {
      const res = await endpoints().adminUsers(query.trim() || undefined);
      users = res.users;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Failed to load users.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  }

  async function toggleSuspend(u: AdminUser) {
    const suspend = !u.suspended;
    const ok = await confirm({
      title: suspend ? `Suspend @${u.username}?` : `Reinstate @${u.username}?`,
      description: suspend
        ? "They will be signed out and unable to sign in until reinstated."
        : "They will be able to sign in again.",
      confirmText: suspend ? "Suspend" : "Reinstate",
      destructive: suspend,
    });
    if (!ok) return;
    busyId = u.id;
    try {
      await endpoints().suspendUser(u.id, suspend);
      u.suspended = suspend;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Action failed.";
    } finally {
      busyId = null;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <div class="relative">
    <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
      <Icon name="search" size={16} />
    </span>
    <input
      bind:value={query}
      oninput={onSearch}
      placeholder="Search by handle or name"
      class="w-full rounded-input border border-input bg-background py-2.5 pl-9 pr-3.5 text-sm shadow-btn outline-none placeholder:text-muted-foreground focus:border-foreground"
    />
  </div>

  {#if error}<p class="text-sm text-destructive">{error}</p>{/if}

  {#if loading}
    <p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
  {:else if users.length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">No accounts found.</p>
  {:else}
    <ul class="flex flex-col divide-y divide-border">
      {#each users as u (u.id)}
        <li class="flex items-center gap-3 py-3">
          <Avatar name={u.displayName} src={u.avatarUrl ?? undefined} size={40} />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <a href={`/@${u.username}`} class="truncate font-medium text-foreground hover:underline">
                {u.displayName}
              </a>
              {#if u.isAdmin}
                <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  <Icon name="admin" size={12} /> Admin
                </span>
              {/if}
              {#if u.suspended}
                <span class="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  Suspended
                </span>
              {/if}
            </div>
            <p class="truncate text-xs text-muted-foreground">
              @{u.username} · {u.email} · joined {formatDate(u.createdAt)}
            </p>
          </div>
          {#if u.id !== selfId && !u.isAdmin}
            <Button
              variant={u.suspended ? "outline" : "destructive"}
              size="sm"
              disabled={busyId === u.id}
              onclick={() => toggleSuspend(u)}
            >
              <Icon name={u.suspended ? "check" : "shieldOff"} size={15} />
              {u.suspended ? "Reinstate" : "Suspend"}
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>
