<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { PUBLIC_APP_NAME, PUBLIC_CONTACT_URL, PUBLIC_SOURCE_URL, PUBLIC_STATUS_URL } from "$app/env/public";
  import type { InstanceInfo } from "#lib/types.js";

  let {
    appName = PUBLIC_APP_NAME || "Omicron",
    instance = null,
    class: className = "",
  }: {
    appName?: string;
    instance?: InstanceInfo | null;
    class?: string;
  } = $props();

  const year = new Date().getFullYear();
  const sourceUrl = $derived(PUBLIC_SOURCE_URL?.trim() || "https://github.com/the-jk-labs/omicron");
  const statusUrl = $derived(instance?.statusUrl || PUBLIC_STATUS_URL?.trim() || "/status");
  const contactHref = $derived(instance?.contactUrl || PUBLIC_CONTACT_URL?.trim() || "/contact");
  // Only a federating instance has a fediverse identity to link to.
  const fediverseDomain = $derived(instance?.federationEnabled ? instance.domain : null);
  const domainLabel = $derived(instance?.domain || appName);
</script>

<footer
  aria-label="Site footer"
  data-testid="site-footer"
  class="border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground {className}"
>
  <div class="space-y-1.5">
    <!-- Instance line — like mastodon.social: keep each · attached to the preceding
         link (whitespace-nowrap group) so wrapping never leaves a bare dot at the
         start of a line, and the dot stays at the end of the previous line. -->
    <p class="flex flex-wrap items-center gap-x-1">
      <span class="font-semibold text-foreground">{domainLabel}:</span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href="/about"
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >About</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href={statusUrl}
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >Status</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href="/about#rules"
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >Instance rules</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href="/privacy"
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >Privacy</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      {#if fediverseDomain}
        <span class="inline-flex items-center gap-1 whitespace-nowrap">
          <a
            href={contactHref}
            class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
            >Contact</a
          >
          <span aria-hidden="true" class="opacity-60">·</span>
        </span>
        <a
          href="https://{fediverseDomain}"
          target="_blank"
          rel="me noopener noreferrer"
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >@{fediverseDomain}</a
        >
      {:else}
        <a
          href={contactHref}
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >Contact</a
        >
      {/if}
    </p>

    <!-- Software line: the platform this instance runs, whatever the instance is called -->
    <p class="flex flex-wrap items-center gap-x-1">
      <span class="font-semibold text-foreground">Omicron:</span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-6 items-center hover:text-foreground hover:underline hover:underline-offset-2"
          >Source</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <span>AGPL-3.0</span>
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="whitespace-nowrap">Federated blogging</span>
    </p>

    <p>© {year} {appName}</p>
  </div>
</footer>
