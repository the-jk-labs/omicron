<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Login-email changes moderators asked for, waiting for an admin. Whoever holds
     the login email can sign in as the account, so only an admin makes the change. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import type { AdminUser, EmailChangeRequest } from "#lib/types.js";

  // `onapproved` lets the user table show the account's new address.
  let {
    initial = null,
    onapproved,
  }: { initial?: EmailChangeRequest[] | null; onapproved?: (user: AdminUser) => void } = $props();
  const seed = untrack(() => initial);

  let items = $state<EmailChangeRequest[]>(seed ?? []);
  let busyId = $state<string | null>(null);
  let error = $state("");
  let notice = $state("");

  onMount(() => {
    if (seed) return;
    endpoints()
      .emailChangeRequests()
      .then((r) => (items = r.items))
      .catch((e) => (error = e instanceof ApiError ? e.message : "Couldn't load email change requests."));
  });

  async function decide(r: EmailChangeRequest, approve: boolean) {
    const { ok } = await confirm(
      approve
        ? {
            title: `Change @${r.user.username}'s login email?`,
            description: `It becomes ${r.newEmail}, unverified until they click the link sent there. ${r.user.email} is told about the change. Whoever holds the new address can sign in as this account, so approve only if you know it's theirs.`,
            confirmText: "Approve",
          }
        : {
            title: `Decline this change for @${r.user.username}?`,
            description: `Their login email stays ${r.user.email}.`,
            confirmText: "Decline",
            destructive: true,
          },
    );
    if (!ok) return;
    busyId = r.id;
    error = notice = "";
    try {
      if (approve) {
        const { user } = await endpoints().approveEmailChange(r.id);
        onapproved?.(user);
        notice = `@${r.user.username}'s login email is now ${r.newEmail}. A verification link was sent there.`;
      } else {
        await endpoints().declineEmailChange(r.id);
        notice = `Declined. @${r.user.username}'s login email is unchanged.`;
      }
      items = items.filter((x) => x.id !== r.id);
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Action failed.";
      // Someone else already decided it.
      if (e instanceof ApiError && e.status === 404) items = items.filter((x) => x.id !== r.id);
    } finally {
      busyId = null;
    }
  }
</script>

{#if items.length || error || notice}
  <section class="mb-5 rounded-card border border-border bg-background-alt p-4" aria-labelledby="email-change-heading">
    <h3 id="email-change-heading" class="flex items-center gap-2 text-sm font-semibold text-foreground">
      <Icon name="mail" size={15} /> Login email changes awaiting approval
    </h3>
    {#if error}<p class="mt-2 text-sm text-destructive" role="alert">{error}</p>{/if}
    {#if notice}<p class="mt-2 text-sm text-muted-foreground" aria-live="polite">{notice}</p>{/if}
    {#if items.length}
      <ul class="mt-3 divide-y divide-border">
        {#each items as r (r.id)}
          <li class="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div class="min-w-0 text-sm">
              <p class="truncate text-foreground">
                <strong class="font-medium">{r.user.displayName}</strong>
                <span class="text-muted-foreground">@{r.user.username}</span>
              </p>
              <p class="truncate text-muted-foreground">
                {r.user.email} → <span class="font-medium text-foreground">{r.newEmail}</span>
              </p>
              <p class="text-xs text-muted-foreground">
                Asked by {r.requestedBy ? `@${r.requestedBy.username}` : "a former moderator"}
                · <Time iso={r.createdAt} />
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" disabled={busyId === r.id} onclick={() => decide(r, false)}>
                Decline
              </Button>
              <Button variant="solid" size="sm" disabled={busyId === r.id} onclick={() => decide(r, true)}>
                Approve…
              </Button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
