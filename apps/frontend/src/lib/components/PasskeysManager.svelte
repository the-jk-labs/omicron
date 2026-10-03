<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The reader's passkeys: add one, rename it, or remove it. Better Auth's
     passkey client does the work; a passkey without a name shows its
     provider's name (set by the server) or just "Passkey". -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { onMount } from "svelte";
  import { authClient } from "#lib/auth-client.js";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import { addPasskeyError, confirmPassword, needsFreshSignIn, passkeysSupported } from "#lib/passkeys.js";

  let { username }: { username: string } = $props();

  type Passkey = { id: string; name?: string | null; backedUp: boolean; createdAt: Date | string };

  const NAME_MAX = 60;

  let passkeys = $state<Passkey[]>([]);
  let loading = $state(true);
  let supported = $state(true);
  let adding = $state(false);
  // The session is too old to add a sign-in method, so the password is asked first.
  let confirming = $state(false);
  let password = $state("");
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
    if (res.error) error = res.error.message ?? "Could not load your passkeys.";
    else passkeys = (res.data ?? []) as Passkey[];
    loading = false;
  }

  async function add() {
    error = "";
    adding = true;
    try {
      const res = await authClient.passkey.addPasskey();
      if (res?.error) {
        if (needsFreshSignIn(res.error)) confirming = true;
        else error = addPasskeyError(res.error);
        return;
      }
      await load();
    } finally {
      adding = false;
    }
  }

  async function confirmAndAdd(e: SubmitEvent) {
    e.preventDefault();
    if (!password) return;
    error = "";
    adding = true;
    const failed = await confirmPassword(username, password);
    adding = false;
    if (failed) {
      error = failed;
      return;
    }
    password = "";
    confirming = false;
    await add();
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

{#if confirming}
  <form onsubmit={confirmAndAdd} class="rounded-card border border-border bg-muted p-4">
    <p class="text-sm font-semibold text-foreground">Confirm it's you</p>
    <p class="mt-1 text-sm text-muted-foreground">
      For your security, enter your password before adding a new way to sign in.
    </p>
    <div class="mt-3 flex flex-col gap-1.5">
      <Label.Root for="passkey-password" class="text-sm leading-none font-medium text-foreground">Password</Label.Root>
      <input
        id="passkey-password"
        type="password"
        bind:value={password}
        autocomplete="current-password"
        class="h-10 rounded-input border border-input bg-background px-3.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
      />
    </div>
    <div class="mt-3 flex justify-end gap-2">
      <Button type="button" variant="ghost" size="sm" onclick={() => ((confirming = false), (password = ""))}>
        Cancel
      </Button>
      <Button type="submit" variant="solid" size="sm" disabled={adding || !password}>
        {adding ? "Checking…" : "Continue"}
      </Button>
    </div>
  </form>
{/if}

{#if error}
  <p class="mt-3 text-sm text-destructive" role="alert">{error}</p>
{/if}

{#if loading}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else if passkeys.length === 0}
  <p class="py-6 text-center text-sm text-muted-foreground">No passkeys yet.</p>
{:else}
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
