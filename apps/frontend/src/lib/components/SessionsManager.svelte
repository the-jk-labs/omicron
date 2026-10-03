<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The reader's signed-in devices, from Better Auth's session list. Other
     sessions can be ended here; this one is ended with Sign out instead. -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { onMount } from "svelte";
  import { authClient } from "#lib/auth-client.js";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import UsernameHint from "#lib/components/UsernameHint.svelte";
  import { confirmPassword, needsFreshSignIn } from "#lib/passkeys.js";
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
  let confirming = $state(false);
  let password = $state("");
  let checking = $state(false);

  const others = $derived(sessions.filter((s) => s.token !== currentToken));
  const iso = (d: Date | string) => new Date(d).toISOString();

  async function load() {
    error = "";
    const [list, current] = await Promise.all([authClient.listSessions(), authClient.getSession()]);
    loading = false;
    if (list.error) {
      if (needsFreshSignIn(list.error)) confirming = true;
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

  async function confirmAndLoad(e: SubmitEvent) {
    e.preventDefault();
    if (!password) return;
    error = "";
    checking = true;
    const failed = await confirmPassword(username, password);
    checking = false;
    if (failed) {
      error = failed;
      return;
    }
    password = "";
    confirming = false;
    loading = true;
    await load();
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
</script>

{#if confirming}
  <form onsubmit={confirmAndLoad} class="rounded-card border border-border bg-muted p-4">
    <UsernameHint {username} />
    <p class="text-sm font-semibold text-foreground">Confirm it's you</p>
    <p class="mt-1 text-sm text-muted-foreground">
      For your security, enter your password to see where you're signed in.
    </p>
    <div class="mt-3 flex flex-col gap-1.5">
      <Label.Root for="sessions-password" class="text-sm leading-none font-medium text-foreground">Password</Label.Root>
      <input
        id="sessions-password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
        class="h-10 rounded-input border border-input bg-background px-3.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
      />
    </div>
    {#if error}<p class="mt-3 text-sm text-destructive" role="alert">{error}</p>{/if}
    <div class="mt-3 flex justify-end">
      <Button type="submit" variant="solid" size="sm" disabled={checking || !password}>
        {checking ? "Checking…" : "Show sessions"}
      </Button>
    </div>
  </form>
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
