<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { onMount } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { Invite } from "#lib/types.js";

  let inviteOnly = $state(false);
  let invites = $state<Invite[]>([]);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state("");
  // Only here until the page closes: the server keeps just a hash of it.
  let createdUrl = $state("");
  let copied = $state(false);

  const failure = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
  const day = (iso: string) => new Date(iso).toLocaleDateString();

  onMount(async () => {
    try {
      ({ inviteOnly, invites } = await endpoints().signupSettings());
    } catch (e) {
      error = failure(e, "Couldn't load sign-up settings.");
    } finally {
      loading = false;
    }
  });

  async function setInviteOnly(next: boolean) {
    busy = true;
    error = "";
    try {
      await endpoints().setInviteOnly(next);
      inviteOnly = next;
    } catch (e) {
      inviteOnly = !next;
      error = failure(e, "Couldn't save that.");
    } finally {
      busy = false;
    }
  }

  async function createInvite() {
    busy = true;
    error = "";
    copied = false;
    try {
      const created = await endpoints().createInvite();
      createdUrl = created.url;
      invites = [created.invite, ...invites];
    } catch (e) {
      error = failure(e, "Couldn't create an invite.");
    } finally {
      busy = false;
    }
  }

  async function revoke(id: string) {
    busy = true;
    error = "";
    try {
      await endpoints().revokeInvite(id);
      invites = invites.filter((invite) => invite.id !== id);
    } catch (e) {
      error = failure(e, "Couldn't revoke that invite.");
    } finally {
      busy = false;
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(createdUrl);
    copied = true;
  }
</script>

<div class="flex flex-col gap-5">
  <div class="flex items-center justify-between gap-4">
    <div>
      <Label.Root for="admin-invite-only" class="text-sm font-medium text-foreground">Invite-only</Label.Root>
      <p class="mt-0.5 text-sm text-muted-foreground">
        New accounts need an invite link. With no invites out, sign-up is simply closed, which suits a personal blog.
        Existing accounts and federation keep working.
      </p>
    </div>
    <Switch.Root
      id="admin-invite-only"
      bind:checked={inviteOnly}
      onCheckedChange={setInviteOnly}
      disabled={loading || busy}
      class="peer inline-flex h-[28px] min-h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
    >
      <Switch.Thumb
        class="pointer-events-none block size-[22px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
      />
    </Switch.Root>
  </div>

  {#if inviteOnly}
    <div class="flex flex-col gap-3">
      <div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onclick={createInvite}>
          <Icon name="mail" size={15} /> Create invite link
        </Button>
        <p class="mt-1.5 text-xs text-muted-foreground">Each link works once and lasts 7 days.</p>
      </div>

      {#if createdUrl}
        <div class="rounded-card border border-border bg-background-alt p-3">
          <p class="text-sm font-medium text-foreground">Copy this link now. It won't be shown again.</p>
          <p class="mt-1 text-sm break-all text-muted-foreground">{createdUrl}</p>
          <Button type="button" variant="outline" size="xs" class="mt-2" onclick={copyLink}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      {/if}

      {#if invites.length > 0}
        <ul class="divide-y divide-border rounded-card border border-border">
          {#each invites as invite (invite.id)}
            <li class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              {#if invite.usedAt}
                <span class="text-muted-foreground">Used by @{invite.usedByUsername} on {day(invite.usedAt)}</span>
              {:else}
                <span class="text-foreground">Unused, expires {day(invite.expiresAt)}</span>
                <Button type="button" variant="ghost" size="xs" disabled={busy} onclick={() => revoke(invite.id)}>
                  Revoke
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
</div>
