<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import type { InstanceInfo } from "$lib/types";

  const instance = $derived(($page.data as { instance?: InstanceInfo | null }).instance ?? null);
  const appName = $derived(instance?.name || env.PUBLIC_APP_NAME || "Omicron");
  const domain = $derived(instance?.domain ?? "this instance");
  const sourceUrl = env.PUBLIC_SOURCE_URL || "https://github.com/the-jk-labs/omicron";
</script>

<PageTitle text="About" />

<article class="mx-auto max-w-3xl">
  <h1 class="text-3xl font-bold tracking-tight text-foreground">About {appName}</h1>
  <p class="mt-3 text-sm leading-relaxed text-muted-foreground">
    {appName} is a federated blogging platform — a home for free expression on the fediverse. Every author is an ActivityPub
    actor, posts federate, and you can self-host your own instance with no vendor lock-in.
  </p>

  <div class="prose-omicron mt-8">
    <h2 id="instance">This instance</h2>
    <p>
      You are reading <strong>{domain}</strong> running <strong>{appName}</strong>. The operator configured this domain
      and instance name via the setup wizard. When federation is enabled this instance participates in the fediverse.
    </p>
    {#if instance?.federationEnabled}
      <p>This instance is federating — profiles and posts can be followed from any ActivityPub server.</p>
    {:else}
      <p>Federation is currently disabled on this instance.</p>
    {/if}

    <h2 id="rules">Instance rules</h2>
    <p>
      The operator sets the rules for this instance. Until custom rules are published here, the baseline is: be
      respectful, no illegal content, no harassment, no spam. Reports are reviewed by the instance moderators via the
      <em>Flag</em> action on posts and profiles.
    </p>
    <p>
      For the full moderation policy or to report abuse, see <a href="/contact">Contact</a>. Admins can edit this page’s
      copy to reflect their real community guidelines — replace this placeholder before operating a public service.
    </p>

    <h2 id="source">Source code</h2>
    <p>
      {appName} is free software licensed under <strong>AGPL-3.0-or-later</strong>. Per AGPL-3.0 §13, anyone who
      interacts with this instance over a network is offered the Corresponding Source.
    </p>
    <p>
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Browse the source</a> — point this link at your fork when
      you run a modified version.
    </p>

    <h2 id="contact">Contact</h2>
    <p>
      For general questions, account issues, or takedown requests: <a href="/contact">contact the operator</a>.
    </p>
  </div>
</article>
