<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Collapsible, Dialog, Label, Select, Separator } from "bits-ui";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import AccessRulePreview from "#lib/components/AccessRulePreview.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { AccessRule, AccessRuleInput } from "#lib/types.js";

  let { disabled = false, onCreated }: { disabled?: boolean; onCreated: (rules: AccessRule[]) => void } = $props();
  let open = $state(false);
  let network = $state("");
  let action = $state<AccessRuleInput["action"]>("block");
  let duration = $state("24");
  let reason = $state("");
  let saving = $state(false);
  let testing = $state(false);
  let previewOpen = $state(false);
  let error = $state("");
  let networkInput = $state<HTMLInputElement | null>(null);
  const durations = [
    { value: "1", label: "1 hour" },
    { value: "24", label: "24 hours" },
    { value: "168", label: "7 days" },
    { value: "720", label: "30 days" },
  ];
  const actions = [
    { value: "block", label: "Block web pages" },
    { value: "allow", label: "Allow without challenge" },
  ];
  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";

  function setOpen(next: boolean) {
    if (saving) return;
    open = next;
    if (next) {
      network = "";
      action = "block";
      duration = "24";
      reason = "";
      previewOpen = false;
      error = "";
    }
  }

  async function add() {
    if (saving || testing || disabled) return;
    saving = true;
    error = "";
    try {
      const response = await endpoints().addAccessRule({
        network: network.trim(),
        action,
        reason: reason.trim(),
        expiresInHours: Number(duration) as AccessRuleInput["expiresInHours"],
      });
      onCreated(response.rules);
      open = false;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Could not apply this IP rule.";
    } finally {
      saving = false;
    }
  }
</script>

{#snippet choice(
  id: string,
  label: string,
  items: { value: string; label: string }[],
  value: string,
  change: (value: string) => void,
)}
  <div class="flex min-w-0 flex-col gap-1.5">
    <Label.Root for={id} class="text-sm font-medium text-foreground">{label}</Label.Root>
    <Select.Root type="single" {value} {items} onValueChange={change} disabled={saving}>
      <Select.Trigger
        {id}
        class="inline-flex h-10 w-full touch-none items-center rounded-9px border border-border-input bg-background px-[11px] text-sm transition-colors select-none data-placeholder:text-foreground-alt/50"
      >
        <span>{items.find((item) => item.value === value)?.label}</span>
        <Icon name="chevronDown" size={16} class="ml-auto shrink-0 text-muted-foreground" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          class="z-50 max-h-64 w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] overflow-y-auto rounded-card border border-muted bg-background p-1 shadow-popover outline-hidden select-none"
          sideOffset={6}
        >
          {#each items as item (item.value)}
            <Select.Item
              value={item.value}
              label={item.label}
              class="flex h-10 w-full items-center rounded-button py-3 pr-1.5 pl-5 text-sm capitalize outline-hidden select-none data-disabled:opacity-50 data-highlighted:bg-muted"
            >
              {#snippet children({ selected })}
                {item.label}
                {#if selected}<Icon name="check" size={15} class="ml-auto" />{/if}
              {/snippet}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>
{/snippet}

<Dialog.Root {open} onOpenChange={setOpen}>
  <Dialog.Trigger {disabled}>
    {#snippet child({ props })}<Button {...props} variant="solid"><Icon name="plus" size={16} /> Add rule</Button
      >{/snippet}
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-dark/40"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card-lg border border-border bg-background p-5 text-foreground shadow-popover outline-hidden sm:max-w-[490px]"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        networkInput?.focus();
      }}
      escapeKeydownBehavior={saving ? "ignore" : "close"}
      interactOutsideBehavior={saving ? "ignore" : "close"}
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight">Add IP rule</Dialog.Title>
      <Dialog.Description class="mt-1 pr-6 text-sm text-muted-foreground"
        >A temporary exception for web-page traffic. Changes apply immediately.</Dialog.Description
      >
      <Dialog.Close
        disabled={saving}
        aria-label="Close add rule"
        class="absolute top-5 right-5 rounded-button focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden active:scale-[0.98] disabled:opacity-50"
        ><Icon name="close" size={18} /></Dialog.Close
      >
      <Separator.Root class="-mx-5 my-5 block h-px bg-muted" />

      <form
        id="access-rule-form"
        class="flex flex-col gap-4"
        onsubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div class="flex flex-col gap-1.5">
          <Label.Root for="access-network" class="text-sm font-medium">IP address or CIDR range</Label.Root>
          <input
            id="access-network"
            bind:this={networkInput}
            bind:value={network}
            required
            maxlength={64}
            placeholder="192.0.2.10 or 2001:db8::/64"
            autocomplete="off"
            spellcheck="false"
            class={field}
            disabled={saving}
          />
          <p class="text-xs text-muted-foreground">Use one address when possible. A range can affect many readers.</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          {@render choice("access-action", "Action", actions, action, (value) => {
            action = value === "allow" ? "allow" : "block";
          })}
          {@render choice("access-duration", "Expires after", durations, duration, (value) => {
            duration = value;
          })}
        </div>
        <p class="text-xs text-muted-foreground">
          {action === "block"
            ? "Returns HTTP 403 on matching web pages. API, federation and recovery paths remain exempt."
            : "Skips Anubis on matching web pages. Sign-in requirements and rate limits still apply."}
        </p>
        <div class="flex flex-col gap-1.5">
          <Label.Root for="access-reason" class="text-sm font-medium">Reason (optional)</Label.Root>
          <input
            id="access-reason"
            bind:value={reason}
            maxlength={300}
            placeholder="e.g. Temporary automated traffic"
            class={field}
            disabled={saving}
          />
        </div>
        {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
      </form>

      <Collapsible.Root bind:open={previewOpen} class="mt-5">
        <Collapsible.Trigger disabled={saving}>
          {#snippet child({ props })}<Button {...props} variant="ghost" size="sm"
              ><Icon name="search" size={15} /> Preview this rule <Icon
                name="chevronDown"
                size={15}
                class={previewOpen ? "rotate-180" : ""}
              /></Button
            >{/snippet}
        </Collapsible.Trigger>
        <Collapsible.Content class="mt-3 overflow-hidden"
          ><AccessRulePreview
            draft={{ network: network.trim(), action }}
            disabled={saving}
            bind:testing
          /></Collapsible.Content
        >
      </Collapsible.Root>

      <div class="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <Dialog.Close disabled={saving}>
          {#snippet child({ props })}<Button {...props} variant="outline" type="button">Cancel</Button>{/snippet}
        </Dialog.Close>
        <Button
          form="access-rule-form"
          type="submit"
          variant="solid"
          disabled={disabled || saving || testing || !network.trim()}
          >{#if saving}<Icon name="spinner" size={15} class="animate-spin" />{/if}{saving
            ? "Applying…"
            : "Apply rule"}</Button
        >
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
