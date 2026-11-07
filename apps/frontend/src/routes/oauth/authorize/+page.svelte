<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { enhance } from "$app/forms";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { PageData, ActionData } from "./$types";

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const scopes = $derived(data.consent.scope.split(" "));
  const identityOnly = $derived(data.consent.scope === "read:accounts");
  const notifiesUntilRevoked = $derived(scopes.includes("webhooks:posts"));
  const administers = $derived(scopes.some((scope) => scope.startsWith("admin:")));
  let deciding = $state(false);
</script>

<PageTitle text="Authorize application" />
<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>

<section class="w-full rounded-card border border-border bg-background p-6 shadow-card sm:p-8">
  <h1 class="text-2xl font-bold tracking-tight text-foreground">
    {identityOnly ? "Sign in with Omicron" : "Authorize application"}
  </h1>
  <p class="mt-4 break-words text-foreground">
    <strong>{data.consent.name}</strong> wants {identityOnly ? "to verify your identity" : "access to your account"} as
    <strong>@{data.consent.username}</strong>.
  </p>
  {#if identityOnly}
    <p class="mt-3 text-sm text-muted-foreground">
      This shares only your account ID, username, display name, and public profile URLs. It cannot read your email or
      private data, publish anything, or manage your account.
    </p>
  {:else}
    <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-foreground">
      {#each data.consent.permissions ?? [] as permission (permission.scope)}
        <li>{permission.description}</li>
      {/each}
    </ul>
    {#if administers}
      <p class="mt-3 text-sm text-muted-foreground">
        Administration permissions never grant a role you do not already have.
      </p>
    {/if}
  {/if}
  <div class="mt-5 flex flex-col gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
    <p>
      You'll return to <strong class="break-all text-foreground">{data.consent.callbackOrigin}</strong>. Application
      names aren't verified, so continue only if you trust this address.
    </p>
    <p>
      {data.consent.renewable ? "Access can renew for up to 90 days." : "Access expires after one hour."}
      {#if notifiesUntilRevoked}Post notifications continue until you revoke access.{/if}
      Revoke anytime in Settings → Integrations.
    </p>
  </div>
  {#if form?.error}<p role="alert" class="mt-4 text-sm text-destructive">{form.error}</p>{/if}
  <!-- The CSP's form-action also covers a form's redirects, so a native submit could never reach the application. -->
  <form
    method="POST"
    class="mt-6 flex justify-end gap-3"
    use:enhance={() => {
      deciding = true;
      return async ({ result, update }) => {
        if (result.type === "redirect") return window.location.assign(result.location);
        deciding = false;
        await update();
      };
    }}
  >
    <input type="hidden" name="ticket" value={data.consent.ticket} />
    <Button type="submit" name="decision" value="deny" variant="outline" disabled={deciding}>Deny</Button>
    <Button type="submit" name="decision" value="allow" variant="solid" disabled={deciding}>
      {identityOnly ? "Allow identity verification" : "Authorize application"}
    </Button>
  </form>
</section>
