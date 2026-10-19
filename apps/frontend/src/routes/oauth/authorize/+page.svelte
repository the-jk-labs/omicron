<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import PageTitle from "#lib/components/PageTitle.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<PageTitle text="Authorize application" />
<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>

<section class="mx-auto max-w-lg rounded-card border border-border bg-background p-6 shadow-card">
  <h1 class="text-2xl font-bold tracking-tight text-foreground">Sign in with Omicron</h1>
  <p class="mt-4 break-words text-foreground">
    <strong>{data.consent.name}</strong> wants to verify your identity as <strong>@{data.consent.username}</strong>.
  </p>
  <p class="mt-3 text-sm text-muted-foreground">
    This shares only your account ID, username, display name, and public profile URLs. It cannot read your email,
    private data, or posts, publish anything, or manage your account.
  </p>
  <div class="mt-4 rounded-input border border-border bg-muted p-3 text-sm text-foreground">
    <p>Return to <strong class="break-all">{data.consent.callbackOrigin}</strong></p>
    <p class="mt-2 text-muted-foreground">
      Application names are supplied by their developers and are not verified. Continue only if you trust this
      destination.
    </p>
  </div>
  <p class="mt-4 text-sm text-muted-foreground">
    Access expires after one hour. You can revoke it sooner in Settings → Integrations → Connected applications.
  </p>
  {#if form?.error}<p role="alert" class="mt-4 text-sm text-destructive">{form.error}</p>{/if}
  <form method="POST" class="mt-6 flex gap-3">
    <input type="hidden" name="ticket" value={data.consent.ticket} />
    <Button type="submit" name="decision" value="deny" variant="outline">Deny</Button>
    <Button type="submit" name="decision" value="allow" variant="solid">Allow identity verification</Button>
  </form>
</section>
