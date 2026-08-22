<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import type { InstanceInfo } from "$lib/types";

  const instance = $derived(($page.data as { instance?: InstanceInfo | null }).instance ?? null);
  const appName = $derived(instance?.name || env.PUBLIC_APP_NAME || "Omicron");
  const domain = $derived(instance?.domain ?? "this instance");
  const contactUrl = (env.PUBLIC_CONTACT_URL as string | undefined)?.trim() || "";
  const contactEmail = (env.PUBLIC_CONTACT_EMAIL as string | undefined)?.trim() || "";
  const abuseEmail = (env.PUBLIC_ABUSE_EMAIL as string | undefined)?.trim() || contactEmail;
</script>

<PageTitle text="Contact · {appName}" />

<article class="mx-auto max-w-3xl">
  <h1 class="text-3xl font-bold tracking-tight text-foreground">Contact</h1>
  <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
    Reach the operator of <strong>{domain}</strong> ({appName}) for general inquiries, data requests, and abuse reports.
  </p>

  <div class="prose-omicron mt-8">
    <h2>General contact</h2>
    {#if contactEmail}
      <p><a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
    {:else if contactUrl}
      <p><a href={contactUrl} target="_blank" rel="noopener noreferrer">{contactUrl}</a></p>
    {:else}
      <p>
        This instance has not published a dedicated contact address yet. If you have an account, use the <em>Flag</em>
        action on the relevant post or profile — it creates a report for the moderators.
      </p>
      <p class="text-sm text-muted-foreground">
        Operators: set <code>PUBLIC_CONTACT_EMAIL</code> or <code>PUBLIC_CONTACT_URL</code> to surface your address here,
        and replace this placeholder with your imprint.
      </p>
    {/if}

    <h2>Abuse and takedown</h2>
    {#if abuseEmail}
      <p><a href={`mailto:${abuseEmail}`}>{abuseEmail}</a></p>
    {:else}
      <p>Use the Flag action on the post or user, or write to the general contact above.</p>
    {/if}
    <p>
      Include the URL of the content, a description of the issue, and your contact information. Moderators review
      reports at <a href="/admin">/admin</a> when signed in as an admin.
    </p>

    <h2>Fediverse</h2>
    <p>
      This instance federates via ActivityPub{#if instance?.federationEnabled}
        at
        <code>{domain}</code>{:else}
        when federation is enabled{/if}. You can follow authors from any compatible server.
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
