<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import type { InstanceInfo } from "$lib/types";

  const instance = $derived(($page.data as { instance?: InstanceInfo | null }).instance ?? null);
  const appName = $derived(instance?.name || env.PUBLIC_APP_NAME || "Omicron");
  const statusExternal = (env.PUBLIC_STATUS_URL as string | undefined)?.trim() || "";
</script>

<PageTitle text="Status" />

<article class="mx-auto max-w-3xl">
  <h1 class="text-3xl font-bold tracking-tight text-foreground">Status</h1>
  <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
    Operational status for <strong>{instance?.domain ?? appName}</strong>.
  </p>

  <div class="prose-omicron mt-8">
    {#if statusExternal}
      <p>
        External status page: <a href={statusExternal} target="_blank" rel="noopener noreferrer">{statusExternal}</a>
      </p>
    {:else}
      <p>This instance does not publish an external status page.</p>
      <p class="text-sm text-muted-foreground">
        Operators: set <code>PUBLIC_STATUS_URL</code> to link your status page here.
      </p>
    {/if}

    <h2>Health endpoints</h2>
    <ul>
      <li><code>/api/healthz</code> — liveness</li>
      <li><code>/api/version</code> — build version and federation state</li>
    </ul>

    <h2>Federation</h2>
    <p>
      {instance?.federationEnabled ? "Federation is enabled." : "Federation is disabled."}
      {#if instance?.domain}Instance domain: <code>{instance.domain}</code>{/if}
    </p>

    <h2>Source</h2>
    <p>
      Source code per AGPL-3.0 §13: <a
        href={env.PUBLIC_SOURCE_URL || "https://github.com/the-jk-labs/omicron"}
        target="_blank"
        rel="noopener noreferrer">Source</a
      >.
    </p>
  </div>
</article>
