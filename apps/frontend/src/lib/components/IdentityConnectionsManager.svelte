<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from "svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { IdentityConnection } from "#lib/oauth.js";

  let connections = $state<IdentityConnection[]>([]);
  let loading = $state(true);
  let error = $state("");
  let busy = $state<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/oauth/connections");
      if (!response.ok) throw new Error("Could not load connected applications.");
      connections = (await response.json()).connections;
    } catch {
      error = "Could not load connected applications.";
    } finally {
      loading = false;
    }
  }

  async function revoke(id: string) {
    busy = id;
    error = "";
    try {
      const response = await fetch(`/api/oauth/connections/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke access.");
      connections = connections.filter((item) => item.id !== id);
    } catch {
      error = "Could not revoke access. Try again.";
    } finally {
      busy = null;
    }
  }

  onMount(() => {
    void load();
  });
</script>

<h2 class="text-lg font-semibold tracking-tight text-foreground">Connected applications</h2>
<p class="mt-1 text-sm text-muted-foreground">
  Applications allowed to verify your public identity. They cannot read private data or post on your behalf.
</p>
{#if error}<p role="alert" class="mt-3 text-sm text-destructive">{error}</p>{/if}
{#if loading}
  <p class="mt-4 text-sm text-muted-foreground">Loading…</p>
{:else if !connections.length && !error}
  <p class="mt-4 text-sm text-muted-foreground">No connected applications.</p>
{:else}
  <ul class="mt-3 divide-y divide-border">
    {#each connections as item (item.id)}
      <li class="flex items-center justify-between gap-3 py-3">
        <div class="min-w-0">
          <p class="text-sm font-medium break-words text-foreground">{item.name}</p>
          <p class="text-xs break-all text-muted-foreground">{item.callbackOrigin}</p>
          <p class="text-xs text-muted-foreground">Expires <Time iso={item.expiresAt} kind="datetime" /></p>
        </div>
        <Button variant="outline" size="sm" disabled={busy !== null} onclick={() => revoke(item.id)}>
          {busy === item.id ? "Revoking…" : "Revoke"}
        </Button>
      </li>
    {/each}
  </ul>
{/if}
