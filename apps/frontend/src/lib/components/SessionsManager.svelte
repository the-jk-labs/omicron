<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The reader's signed-in devices, from Better Auth's session list. Other
     sessions can be ended here; this one is ended with Sign out instead. -->
<script lang="ts">
  import { onMount } from "svelte";
  import { authClient } from "#lib/auth-client.js";
  import ConfirmPasswordDialog from "#lib/components/ConfirmPasswordDialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import { freshSignIn } from "#lib/freshSignIn.svelte.js";
  import { needsFreshSignIn } from "#lib/passkeys.js";
  import { deviceLabel, parseUserAgent } from "#lib/userAgent.js";

  let { username }: { username: string } = $props();

  type Session = {
    token: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };

  let sessions = $state<Session[]>([]);
  let currentToken = $state<string | null>(null);
  let loading = $state(true);
  let error = $state("");
  let busy = $state<string | null>(null); // token being revoked, or "others"
  // Better Auth only lists sessions to a recent sign-in, so an older one confirms the password first.
  let locked = $state(false);
  let confirming = $state(false);

  const others = $derived(sessions.filter((s) => s.token !== currentToken));
  const iso = (d: Date | string) => new Date(d).toISOString();

  async function load() {
    error = "";
    const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    loading = false;
    if (list.error) {
      if (needsFreshSignIn(list.error)) locked = true;
      else error = list.error.message ?? "Could not load your sessions.";
      return;
    }
    currentToken = current.data?.session.token ?? null;
    // This device first, then the most recently active.
    sessions = ((list.data ?? []) as Session[]).toSorted(
      (a, b) =>
        Number(b.token === currentToken) - Number(a.token === currentToken) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  async function revoke(session: Session) {
    error = "";
    busy = session.token;
    const res = await authClient.revokeSession({ token: session.token });
    busy = null;
    if (res.error) {
      error = res.error.message ?? "Could not sign out that session.";
      return;
    }
    sessions = sessions.filter((s) => s.token !== session.token);
  }

  async function revokeOthers() {
    const { ok } = await confirm({
      title: "Sign out all other sessions?",
      description: `Every other device signed in to your account (${others.length}) will be signed out. This one stays signed in.`,
      confirmText: "Sign out others",
      destructive: true,
    });
    if (!ok) return;
    error = "";
    busy = "others";
    const res = await authClient.revokeOtherSessions();
    busy = null;
    if (res.error) {
      error = res.error.message ?? "Could not sign out the other sessions.";
      return;
    }
    sessions = sessions.filter((s) => s.token === currentToken);
  }

  // Browser-only: the client uses relative URLs.
  onMount(() => {
    load();
  });

  // A confirmation anywhere on the page (e.g. adding a passkey) unlocks the list
  // and swaps this device's session, so the list is reloaded either way.
  let seen = freshSignIn.confirmations;
  $effect(() => {
    if (freshSignIn.confirmations === seen) return;
    seen = freshSignIn.confirmations;
    locked = false;
    loading = true;
    load();
  });
</script>

<ConfirmPasswordDialog
  bind:open={confirming}
  {username}
  description="For your security, enter your password to see where you're signed in."
/>

{#if locked}
  <div class="flex flex-col items-center gap-3 py-6 text-center text-sm">
    <p class="text-muted-foreground">For your security, confirm it's you to see where you're signed in.</p>
    <Button variant="outline" size="sm" onclick={() => (confirming = true)}>
      <Icon name="lock" size={15} />
      Confirm it's you
    </Button>
  </div>
{:else if loading}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else}
  {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}

  <ul class="divide-y divide-border">
    {#each sessions as session (session.token)}
      {@const device = parseUserAgent(session.userAgent)}
      {@const current = session.token === currentToken}
      <li class="flex items-center justify-between gap-3 py-3">
        <span class="flex min-w-0 items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-alt">
            <Icon name={device.mobile ? "phone" : "monitor"} size={18} />
          </span>
          <span class="min-w-0">
            <span class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium text-foreground">{deviceLabel(device)}</span>
              {#if current}
                <span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                  >Current session</span
                >
              {/if}
            </span>
            <span class="block truncate text-xs text-muted-foreground">
              {#if session.ipAddress}{session.ipAddress} ·
              {/if}Signed in <Time iso={iso(session.createdAt)} kind="date" />
              {#if !current}
                · Last active <Time iso={iso(session.updatedAt)} kind="date" />
              {/if}
            </span>
          </span>
        </span>
        {#if !current}
          <Button variant="outline" size="sm" disabled={busy !== null} onclick={() => revoke(session)}>
            {busy === session.token ? "…" : "Sign out"}
          </Button>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="mt-4 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p class="text-xs text-muted-foreground">To end this session, use Sign out above.</p>
    <Button variant="outline" size="sm" disabled={others.length === 0 || busy !== null} onclick={revokeOthers}>
      <Icon name="logout" size={15} />
      {busy === "others" ? "Signing out…" : "Sign out all other sessions"}
    </Button>
  </div>
{/if}
