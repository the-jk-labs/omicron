<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Publishing tokens for the content webhook. A writer mints one per external
     system, pastes it there, and revokes it here if it leaks. The plaintext is
     returned by the mint call and never again — only its hash is stored — so
     the freshly-minted value is held in local state and surfaced once, with a
     copy button, until the user dismisses it. -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { ApiError, endpoints } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import { formatDate } from "$lib/format";
  import type { WebhookToken } from "$lib/types";

  const api = endpoints();

  let tokens = $state<WebhookToken[]>([]);
  let loaded = $state(false);
  let loading = $state(true);
  let label = $state("");
  let creating = $state(false);
  let busy = $state<string | null>(null); // id whose revoke is in flight
  let error = $state("");
  // The one and only time this value exists outside the caller's CMS.
  let freshToken = $state<string | null>(null);
  let copied = $state(false);

  // Height is pinned rather than derived from padding, so the input and the
  // Create button beside it are the same 40px — `Button size="default"` is h-10.
  const field =
    "h-10 rounded-input border border-input bg-background shadow-btn px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground";

  async function load() {
    loading = true;
    try {
      tokens = (await api.webhookTokens()).tokens;
      loaded = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Could not load your tokens.";
    } finally {
      loading = false;
    }
  }

  async function create() {
    if (!label.trim() || creating) return;
    error = "";
    creating = true;
    try {
      const res = await api.createWebhookToken(label.trim());
      tokens = [res.tokenInfo, ...tokens];
      freshToken = res.token;
      copied = false;
      label = "";
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Could not create the token.";
    } finally {
      creating = false;
    }
  }

  async function copy() {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      copied = true;
    } catch {
      // Clipboard access can be refused (insecure context, denied permission).
      // The token is on screen and selectable, so this is not worth an error.
    }
  }

  async function revoke(token: WebhookToken) {
    const ok = await confirm({
      title: "Revoke this token?",
      description:
        `“${token.label}” will stop working immediately. Anything publishing with it ` +
        `will start getting 401s until you issue a new one. Posts already published stay put.`,
      confirmText: "Revoke",
      destructive: true,
    });
    if (!ok) return;

    busy = token.id;
    try {
      await api.revokeWebhookToken(token.id);
      tokens = tokens.filter((t) => t.id !== token.id);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Could not revoke the token.";
    } finally {
      busy = null;
    }
  }

  load();
</script>

{#if freshToken}
  <div class="rounded-card border border-foreground/30 bg-muted p-4">
    <p class="text-sm font-semibold text-foreground">Copy your token now</p>
    <p class="mt-1 text-sm text-muted-foreground">
      This is the only time it is shown. It is stored hashed, so it cannot be displayed again — if
      you lose it, revoke this token and create another.
    </p>
    <div class="mt-3 flex items-center gap-2">
      <code
        class="min-w-0 flex-1 overflow-x-auto rounded-input border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
        >{freshToken}</code
      >
      <Button variant="outline" size="sm" onclick={copy}>
        <Icon name={copied ? "check" : "copy"} size={15} />
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
    <div class="mt-3 flex justify-end">
      <Button variant="ghost" size="sm" onclick={() => (freshToken = null)}>Done</Button>
    </div>
  </div>
{/if}

<div class="mt-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-2">
  <div class="flex min-w-0 flex-1 flex-col gap-1.5">
    <Label.Root for="tokenLabel" class="text-sm font-medium leading-none">
      New token
    </Label.Root>
    <input
      id="tokenLabel"
      bind:value={label}
      maxlength={60}
      placeholder="What is it for? e.g. Sanity"
      class={`${field} w-full`}
      onkeydown={(e) => e.key === "Enter" && create()}
    />
  </div>
  <Button
    variant="outline"
    size="default"
    class="shrink-0"
    disabled={!label.trim() || creating}
    onclick={create}
  >
    <Icon name="plus" size={15} />
    {creating ? "Creating…" : "Create"}
  </Button>
</div>

{#if error}
  <p class="mt-3 text-sm text-destructive">{error}</p>
{/if}

{#if loading && !loaded}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else if tokens.length === 0}
  <p class="py-6 text-center text-sm text-muted-foreground">
    No tokens yet. Create one to publish from an external system.
  </p>
{:else}
  <ul class="mt-2 divide-y divide-border">
    {#each tokens as token (token.id)}
      <li class="flex items-center justify-between gap-3 py-3">
        <span class="flex min-w-0 items-center gap-3">
          <span
            class="bg-muted text-foreground-alt flex size-10 shrink-0 items-center justify-center rounded-full"
          >
            <Icon name="lock" size={18} />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-foreground">{token.label}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {token.lastUsedAt
                ? `Last used ${formatDate(token.lastUsedAt)}`
                : "Never used"} · Created {formatDate(token.createdAt)}
            </span>
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy === token.id}
          onclick={() => revoke(token)}
        >
          {busy === token.id ? "…" : "Revoke"}
        </Button>
      </li>
    {/each}
  </ul>
{/if}
