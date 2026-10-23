<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { PUBLIC_APP_NAME } from "$app/env/public";
  import { page } from "$app/state";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import { proxyImageHtml } from "#lib/imageProxy.js";
  import type { InstanceInfo } from "#lib/types.js";

  const instance = $derived((page.data as { instance?: InstanceInfo | null }).instance ?? null);
  const appName = $derived(instance?.name || PUBLIC_APP_NAME || "Omicron");
  const domain = $derived(instance?.domain ?? "this instance");
</script>

<PageTitle text="Privacy" />

<article class="mx-auto max-w-3xl">
  <h1 class="text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
  <p class="mt-2 text-sm text-muted-foreground">
    Last updated: {new Date().getFullYear()} · {domain}
  </p>

  <div class="prose-omicron mt-8">
    {#if instance?.privacyPolicyHtml}
      <!-- Rendered and sanitized server-side; see backend lib/markdown.ts. -->
      {@html proxyImageHtml(instance.privacyPolicyHtml)}
    {:else}
      <p>
        This is a placeholder privacy notice for <strong>{appName} ({domain})</strong>. If you operate a public instance
        in the EU/EEA you <em>must</em> replace it with your own policy before offering the service. It is not legal advice.
      </p>

      <h2>Data we collect</h2>
      <ul>
        <li>Account data you provide (username, display name, email, profile content).</li>
        <li>Content you publish (posts, comments, media, reading lists).</li>
        <li>Usage data necessary to operate the service (logs, federation delivery, rate-limit counters).</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To provide the blogging and federation features, moderate the community, and keep the service secure. We do not
        sell your data.
      </p>

      <h2>Federation</h2>
      <p>
        Public posts and your public profile federate over ActivityPub to other instances that follow you or are
        otherwise addressed. Those instances apply their own privacy policies once they receive your data.
      </p>

      <h2>Cookies and storage</h2>
      <p>
        A session cookie authenticates you. A timezone cookie improves date rendering. Local storage keeps your editor
        drafts and preferences. Post-read counting may use a random first-party reader cookie to avoid counting the same
        browser twice for a post.
      </p>

      <h2>Your rights</h2>
      <p>
        You can edit or delete your content and account from <a href="/settings">Settings</a>. Contact the operator via
        <a href="/contact">Contact</a> for access, correction, or deletion requests.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="/contact">contact the operator</a>. For abuse reports, use the Flag action
        on the relevant post or profile, or the contact page.
      </p>

      <p class="text-sm text-muted-foreground">
        Operator: replace this template with the identity and contact details required for your jurisdiction (e.g. GDPR
        controller, imprint).
      </p>
    {/if}

    <h2>Site traffic analytics</h2>
    <p>
      Site traffic collection is currently <strong>{instance?.trafficEnabled ? "enabled" : "disabled"}</strong>. When
      enabled, successful public-page loads may be counted without analytics cookies, browser storage, or persistent
      browser identifiers. The traffic request omits sign-in cookies. It does not fingerprint readers, hash IPs into
      identifiers, or measure unique visitors and visits. Administrators see daily aggregate pageviews, public paths,
      referring domains, and broad device/browser/operating-system categories. If configured, country is determined
      locally from the connection address; the address is discarded, not stored in analytics.
    </p>
    <p>
      Analytics stores no individual visit log, reader IP, raw user agent, search query, or referrer path. Aggregate
      statistics are retained for 730 days. Do Not Track and Global Privacy Control prevent collection. Disabled
      JavaScript or a blocked analytics request also prevents a site-traffic measurement. The operator is responsible
      for any consent required by local law.
    </p>
  </div>
</article>
