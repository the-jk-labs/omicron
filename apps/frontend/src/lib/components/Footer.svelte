<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { env } from "$env/dynamic/public";
  import type { InstanceInfo } from "$lib/types";

  let {
    appName = env.PUBLIC_APP_NAME || "Omicron",
    instance = null,
  }: {
    appName?: string;
    instance?: InstanceInfo | null;
  } = $props();

  const year = new Date().getFullYear();
  const sourceUrl = $derived(
    (env.PUBLIC_SOURCE_URL as string | undefined)?.trim() || "https://github.com/the-jk-labs/omicron",
  );
  const statusUrl = $derived((env.PUBLIC_STATUS_URL as string | undefined)?.trim() || "/status");
  // Fediverse profile: the instance itself when federation is on. Falls back to
  // a generic fediverse directory link when not federating — keeps the slot
  // occupied rather than shifting layout between instances.
  const fediverseUrl = $derived.by(() => {
    if (instance?.federationEnabled && instance.domain) return `https://${instance.domain}`;
    return "https://joinmastodon.org/servers";
  });
  const fediverseLabel = $derived(instance?.federationEnabled && instance.domain ? `@${instance.domain}` : "Fediverse");
  const contactHref = $derived((env.PUBLIC_CONTACT_URL as string | undefined)?.trim() || "/contact");
</script>

<footer aria-label="Site footer" class="border-t border-border bg-background" data-testid="site-footer">
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
      <!-- Brand + legal notice -->
      <div class="space-y-1">
        <p class="text-sm font-semibold text-foreground">{appName}</p>
        <p class="text-xs leading-relaxed text-muted-foreground">
          © {year}
          {appName} · Federated blogging ·
          <span class="whitespace-nowrap"
            >AGPL-3.0 · <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="underline underline-offset-4 hover:text-foreground">Source</a
            ></span
          >
        </p>
        {#if instance?.domain}
          <p class="text-xs text-muted-foreground">{instance.domain}</p>
        {/if}
      </div>

      <!-- Footer navigation -->
      <nav aria-label="Footer" class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a href="/about" class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">About</a
        >
        <a href="/about#rules" class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >Instance rules</a
        >
        <a href="/privacy" class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >Privacy</a
        >
        <a href={contactHref} class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >Contact</a
        >
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Source</a
        >
        <a href={statusUrl} class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >Status</a
        >
        <a
          href={fediverseUrl}
          target={fediverseUrl.startsWith("http") ? "_blank" : undefined}
          rel={fediverseUrl.startsWith("http") ? "me noopener noreferrer" : "me"}
          class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{fediverseLabel}</a
        >
      </nav>
    </div>

    <!-- Secondary row: imprint / abuse hint for EU public services -->
    <p class="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
      Self-hostable · No vendor lock-in ·
      <a href="/privacy" class="underline underline-offset-4 hover:text-foreground">Privacy policy</a>
      ·
      <a href="/contact" class="underline underline-offset-4 hover:text-foreground">Abuse / Contact</a>
      . Source code offered per AGPL-3.0 §13 via the “Source” link above.
    </p>
  </div>
</footer>
