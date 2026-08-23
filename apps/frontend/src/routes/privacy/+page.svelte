<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/stores";
  import { env } from "$env/dynamic/public";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import type { InstanceInfo } from "$lib/types";

  const instance = $derived(($page.data as { instance?: InstanceInfo | null }).instance ?? null);
  const appName = $derived(instance?.name || env.PUBLIC_APP_NAME || "Omicron");
  const domain = $derived(instance?.domain ?? "this instance");
</script>

<PageTitle text="Privacy" />

<article class="mx-auto max-w-3xl">
  <h1 class="text-3xl font-bold tracking-tight text-foreground">Privacy policy</h1>
  <p class="mt-2 text-sm text-muted-foreground">
    Last updated: {new Date().getFullYear()} · {domain}
  </p>

  <div class="prose-omicron mt-8">
    <p>
      This is a placeholder privacy notice for <strong>{appName} ({domain})</strong>. If you operate a public instance
      in the EU/EEA you <em>must</em> replace it with your own policy before offering the service — it is not legal advice.
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
      Public posts and your public profile federate over ActivityPub to other instances that follow you or are otherwise
      addressed. Those instances apply their own privacy policies once they receive your data.
    </p>

    <h2>Cookies and storage</h2>
    <p>
      A session cookie authenticates you. A timezone cookie improves date rendering. Local storage keeps your editor
      drafts and preferences. No tracking cookies.
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
  </div>
</article>
