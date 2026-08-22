<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { env } from "$env/dynamic/public";
  import type { InstanceInfo } from "$lib/types";

  let {
    appName = env.PUBLIC_APP_NAME || "Omicron",
    instance = null,
    class: className = "",
  }: {
    appName?: string;
    instance?: InstanceInfo | null;
    class?: string;
  } = $props();

  const year = new Date().getFullYear();
  const sourceUrl = $derived(
    (env.PUBLIC_SOURCE_URL as string | undefined)?.trim() || "https://github.com/the-jk-labs/omicron",
  );
  const statusUrl = $derived((env.PUBLIC_STATUS_URL as string | undefined)?.trim() || "/status");
  const contactHref = $derived((env.PUBLIC_CONTACT_URL as string | undefined)?.trim() || "/contact");
  const fediverseUrl = $derived.by(() => {
    if (instance?.federationEnabled && instance.domain) return `https://${instance.domain}`;
    return "https://joinmastodon.org/servers";
  });
  const domainLabel = $derived(instance?.domain || appName);
  const fediverseLabel = $derived(instance?.federationEnabled && instance.domain ? `@${instance.domain}` : "Fediverse");
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
    <p class="flex flex-wrap gap-x-1 gap-y-0.5">
      <span class="font-semibold text-foreground">{domainLabel}:</span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a href="/about" class="hover:text-foreground hover:underline hover:underline-offset-2">About</a>
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a href={statusUrl} class="hover:text-foreground hover:underline hover:underline-offset-2">Status</a>
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a href="/about#rules" class="hover:text-foreground hover:underline hover:underline-offset-2">Instance rules</a>
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a href="/privacy" class="hover:text-foreground hover:underline hover:underline-offset-2">Privacy</a>
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <a href={contactHref} class="hover:text-foreground hover:underline hover:underline-offset-2">Contact</a>
    </p>

    <!-- Project line — like Mastodon: same wrapping fix -->
    <p class="flex flex-wrap gap-x-1 gap-y-0.5">
      <span class="font-semibold text-foreground">{appName}:</span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="hover:text-foreground hover:underline hover:underline-offset-2">Source</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <a
          href={fediverseUrl}
          target={fediverseUrl.startsWith("http") ? "_blank" : undefined}
          rel={fediverseUrl.startsWith("http") ? "me noopener noreferrer" : "me"}
          class="hover:text-foreground hover:underline hover:underline-offset-2">{fediverseLabel}</a
        >
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <span>AGPL-3.0</span>
        <span aria-hidden="true" class="opacity-60">·</span>
      </span>
      <span class="whitespace-nowrap">© {year} {appName} · Federated blogging</span>
    </p>
  </div>
</footer>
