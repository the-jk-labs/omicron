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
  class="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground {className}"
>
  <div class="space-y-2">
    <!-- Instance line — like mastodon.social: -->
    <p class="flex flex-wrap items-baseline gap-x-1.5">
      <span class="font-semibold text-foreground">{domainLabel}:</span>
      <a href="/about" class="hover:text-foreground hover:underline hover:underline-offset-2">About</a>
      <span aria-hidden="true" class="opacity-60">·</span>
      <a href={statusUrl} class="hover:text-foreground hover:underline hover:underline-offset-2">Status</a>
      <span aria-hidden="true" class="opacity-60">·</span>
      <a href="/about#rules" class="hover:text-foreground hover:underline hover:underline-offset-2">Instance rules</a>
      <span aria-hidden="true" class="opacity-60">·</span>
      <a href="/privacy" class="hover:text-foreground hover:underline hover:underline-offset-2">Privacy</a>
      <span aria-hidden="true" class="opacity-60">·</span>
      <a href={contactHref} class="hover:text-foreground hover:underline hover:underline-offset-2">Contact</a>
    </p>

    <!-- Project line — like Mastodon: -->
    <p class="flex flex-wrap items-baseline gap-x-1.5">
      <span class="font-semibold text-foreground">{appName}:</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-foreground hover:underline hover:underline-offset-2">Source</a
      >
      <span aria-hidden="true" class="opacity-60">·</span>
      <a
        href={fediverseUrl}
        target={fediverseUrl.startsWith("http") ? "_blank" : undefined}
        rel={fediverseUrl.startsWith("http") ? "me noopener noreferrer" : "me"}
        class="hover:text-foreground hover:underline hover:underline-offset-2">{fediverseLabel}</a
      >
      <span aria-hidden="true" class="opacity-60">·</span>
      <span>AGPL-3.0</span>
      <span aria-hidden="true" class="opacity-60">·</span>
      <span>© {year} {appName} · Federated blogging</span>
    </p>
  </div>
</footer>
