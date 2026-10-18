<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label } from "bits-ui";
  import { onDestroy } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { AccessRuleInput, AccessRuleTest } from "#lib/types.js";

  let {
    draft,
    disabled = false,
    testing = $bindable(false),
    inputRef = $bindable(null),
  }: {
    draft?: Pick<AccessRuleInput, "network" | "action">;
    disabled?: boolean;
    testing?: boolean;
    inputRef?: HTMLInputElement | null;
  } = $props();
  let ip = $state("");
  let path = $state("/search");
  let result = $state<AccessRuleTest | null>(null);
  let error = $state("");
  let disposed = false;
  const inputs = $derived(JSON.stringify({ ip: ip.trim(), path, draft }));
  const title = $derived(
    result
      ? { allow: "Would allow", block: "Would block", exempt: "Exempt path", default: "No matching rule" }[
          result.action
        ]
      : "",
  );
  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";

  $effect(() => {
    inputs;
    result = null;
    error = "";
  });
  onDestroy(() => {
    disposed = true;
    testing = false;
  });

  async function preview() {
    if (testing || disabled) return;
    const snapshot = inputs;
    testing = true;
    result = null;
    error = "";
    try {
      const response = await endpoints().testAccessRules(ip.trim(), path, draft);
      if (!disposed && inputs === snapshot) result = response;
    } catch (e) {
      if (!disposed && inputs === snapshot)
        error = e instanceof ApiError ? e.message : "Could not test this IP address.";
    } finally {
      if (!disposed) testing = false;
    }
  }
</script>

<form
  class="flex flex-col gap-4"
  onsubmit={(e) => {
    e.preventDefault();
    void preview();
  }}
>
  <div class="grid gap-3 sm:grid-cols-2">
    <div class="flex min-w-0 flex-col gap-1.5">
      <Label.Root for="access-test-ip" class="text-sm font-medium text-foreground">Visitor IP address</Label.Root>
      <input
        id="access-test-ip"
        bind:this={inputRef}
        bind:value={ip}
        required
        maxlength={64}
        placeholder="192.0.2.10"
        autocomplete="off"
        spellcheck="false"
        class={field}
        {disabled}
      />
    </div>
    <div class="flex min-w-0 flex-col gap-1.5">
      <Label.Root for="access-test-path" class="text-sm font-medium text-foreground">URL path</Label.Root>
      <input
        id="access-test-path"
        bind:value={path}
        required
        maxlength={2048}
        placeholder="/search"
        autocomplete="off"
        spellcheck="false"
        class={field}
        {disabled}
      />
    </div>
  </div>
  <div>
    <Button
      type="submit"
      variant="outline"
      disabled={disabled || testing || !ip.trim() || (draft !== undefined && !draft.network.trim())}
    >
      <Icon name={testing ? "spinner" : "search"} size={15} class={testing ? "animate-spin" : ""} />
      {testing ? "Testing…" : draft ? "Test draft rule" : "Test saved rules"}
    </Button>
  </div>
  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
  {#if result}
    <div role="status" class="flex items-start gap-3 rounded-input border border-border bg-muted p-3">
      <Icon name={result.action === "block" ? "block" : "admin"} size={18} class="mt-0.5 shrink-0 text-foreground" />
      <div>
        <p class="text-sm font-semibold text-foreground">{title}</p>
        <p class="mt-1 text-sm text-muted-foreground">{result.message}</p>
      </div>
    </div>
  {/if}
  <p class="text-xs leading-relaxed text-muted-foreground">
    Preview only. Nothing is applied, and Anubis's built-in bot policy is not simulated.
  </p>
</form>
