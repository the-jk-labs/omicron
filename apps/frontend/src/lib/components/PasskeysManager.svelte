<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The reader's passkeys: add one, rename it, or remove it. Better Auth's
     passkey client does the work; a passkey without a name shows its
     provider's name (set by the server) or just "Passkey". -->
<script lang="ts">
  import { onMount } from "svelte";
  import { authClient } from "#lib/auth-client.js";
  import ConfirmPasswordDialog from "#lib/components/ConfirmPasswordDialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import { addPasskeyError, needsFreshSignIn, passkeysSupported } from "#lib/passkeys.js";

  let { username }: { username: string } = $props();

  type Passkey = {
    id: string;
    name?: string | null;
    backedUp: boolean;
    createdAt: Date | string;
  };

  const NAME_MAX = 60;

  let passkeys = $state<Passkey[]>([]);
  let loading = $state(true);
  let loaded = $state(false);
  let supported = $state(true);
  let adding = $state(false);
  // The session is too old to add a sign-in method, so the password is asked first.
  let confirming = $state(false);
  let error = $state("");
  let busy = $state<string | null>(null); // id whose rename/delete is in flight
  let editing = $state<string | null>(null);
  let draft = $state("");

  const field =
    "h-9 min-w-0 flex-1 rounded-input border border-input bg-background shadow-btn px-3 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";

  const label = (p: Passkey) => p.name?.trim() || "Passkey";
  const iso = (d: Date | string) => new Date(d).toISOString();

  async function load() {
    const res = await authClient.passkey.listUserPasskeys();
    loading = false;
    if (res.error) error = res.error.message ?? "Could not load your passkeys.";
    else {
      passkeys = (res.data ?? []) as Passkey[];
      loaded = true;
    }
  }

  async function add() {
    error = "";
    adding = true;
    try {
      const res = await authClient.passkey.addPasskey();
      if (!res?.error) await load();
      else if (needsFreshSignIn(res.error)) confirming = true;
      else error = addPasskeyError(res.error);
    } finally {
      adding = false;
    }
  }

  function startRename(p: Passkey) {
    editing = p.id;
    draft = p.name ?? "";
    error = "";
  }

  async function rename(p: Passkey) {
    const name = draft.trim();
    if (!name || busy) return;
    busy = p.id;
    const res = await authClient.passkey.updatePasskey({ id: p.id, name });
    busy = null;
    if (res.error) {
      error = res.error.message ?? "Could not rename the passkey.";
      return;
    }
    passkeys = passkeys.map((x) => (x.id === p.id ? { ...x, name } : x));
    editing = null;
  }

  async function remove(p: Passkey) {
    const { ok } = await confirm({
      title: "Remove this passkey?",
      description: `You won't be able to sign in with “${label(p)}” anymore. Your password and other passkeys keep working.`,
      confirmText: "Remove",
      destructive: true,
    });
    if (!ok) return;
    error = "";
    busy = p.id;
    const res = await authClient.passkey.deletePasskey({ id: p.id });
    busy = null;
    if (res.error) {
      error = res.error.message ?? "Could not remove the passkey.";
      return;
    }
    passkeys = passkeys.filter((x) => x.id !== p.id);
  }

  // Browser-only: support is a browser fact and the client uses relative URLs.
  onMount(() => {
    supported = passkeysSupported();
    load();
  });
</script>

<ConfirmPasswordDialog
  bind:open={confirming}
  {username}
  description="For your security, enter your password before adding a new way to sign in."
  onconfirmed={add}
/>

{#if error}
  <p class="mt-3 text-sm text-destructive" role="alert">{error}</p>
{/if}

{#if loading}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else if loaded && passkeys.length === 0}
  <p class="py-6 text-center text-sm text-muted-foreground">No passkeys yet.</p>
{:else if loaded}
  <ul class="mt-2 divide-y divide-border">
    {#each passkeys as p (p.id)}
      <li class="flex items-center justify-between gap-3 py-3">
        <span class="flex min-w-0 flex-1 items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-alt">
            <Icon name="key" size={18} />
          </span>
          {#if editing === p.id}
            <input
              bind:value={draft}
              maxlength={NAME_MAX}
              aria-label="Passkey name"
              placeholder="e.g. Work laptop"
              class={field}
              onkeydown={(e) => {
                if (e.key === "Enter") rename(p);
                if (e.key === "Escape") editing = null;
              }}
            />
          {:else}
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-foreground">{label(p)}</span>
              <span class="block truncate text-xs text-muted-foreground">
                {p.backedUp ? "Synced" : "This device only"} · Added <Time iso={iso(p.createdAt)} kind="date" />
              </span>
            </span>
          {/if}
        </span>
        <span class="flex shrink-0 items-center gap-2">
          {#if editing === p.id}
            <Button variant="ghost" size="sm" onclick={() => (editing = null)}>Cancel</Button>
            <Button variant="outline" size="sm" disabled={!draft.trim() || busy === p.id} onclick={() => rename(p)}>
              {busy === p.id ? "Saving…" : "Save"}
            </Button>
          {:else}
            <Button variant="outline" size="sm" disabled={busy === p.id} onclick={() => startRename(p)}>Rename</Button>
            <Button variant="outline" size="sm" disabled={busy === p.id} onclick={() => remove(p)}>
              {busy === p.id ? "…" : "Remove"}
            </Button>
          {/if}
        </span>
      </li>
    {/each}
  </ul>
{/if}

<div class="mt-4 flex items-center justify-end gap-3">
  {#if !supported}
    <p class="text-xs text-muted-foreground">This browser doesn't support passkeys.</p>
  {/if}
  <Button variant="outline" size="sm" disabled={!supported || adding} onclick={add}>
    <Icon name="plus" size={15} />
    {adding ? "Waiting for your device…" : "Add a passkey"}
  </Button>
</div>
