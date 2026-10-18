<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Collapsible, Dialog, DropdownMenu, Separator } from "bits-ui";
  import { onMount } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import AccessRulePreview from "#lib/components/AccessRulePreview.svelte";
  import AdminAccessRuleDialog from "#lib/components/AdminAccessRuleDialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { AccessRule } from "#lib/types.js";

  let { managed }: { managed: boolean } = $props();
  let rules = $state<AccessRule[]>([]);
  let loading = $state(true);
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  let now = $state(Date.now());
  let safeguardsOpen = $state(false);
  let previewInput = $state<HTMLInputElement | null>(null);
  const activeCount = $derived(rules.filter((rule) => rule.enabled && Date.parse(rule.expiresAt) > now).length);
  const itemClass =
    "rounded-button data-highlighted:bg-muted ring-0! ring-transparent! flex h-10 select-none items-center py-3 pl-3 pr-1.5 text-sm font-medium focus-visible:outline-none";

  async function load() {
    loading = true;
    error = "";
    try {
      rules = (await endpoints().accessRules()).rules;
      loaded = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Could not load IP rules.";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  async function change(rule: AccessRule, remove = false) {
    if (busy || !managed) return;
    busy = true;
    error = "";
    notice = "";
    try {
      rules = (
        await (remove
          ? endpoints().removeAccessRule(rule.id)
          : endpoints().setAccessRuleEnabled(rule.id, !rule.enabled))
      ).rules;
      notice = remove ? "IP rule removed." : "IP rule updated.";
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Could not update IP rules.";
    } finally {
      busy = false;
    }
  }

  function created(next: AccessRule[]) {
    rules = next;
    error = "";
    notice = "IP rule applied. It expires automatically.";
  }
</script>

<section class="flex flex-col gap-4" aria-labelledby="ip-rules-heading">
  <div class="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
    <div>
      <div class="flex items-center gap-2">
        <h3 id="ip-rules-heading" class="text-base font-semibold text-foreground">IP access rules</h3>
        {#if loaded}<span class="rounded-button bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >{activeCount} active</span
          >{/if}
      </div>
      <p class="mt-1 text-sm text-muted-foreground">
        Temporary allow and block rules, separate from the challenge switch.
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Dialog.Root>
        <Dialog.Trigger disabled={!loaded || busy}>
          {#snippet child({ props })}<Button {...props} variant="outline"
              ><Icon name="search" size={15} /> Test rules</Button
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
              previewInput?.focus();
            }}
          >
            <Dialog.Title class="text-lg font-semibold tracking-tight">Test saved rules</Dialog.Title>
            <Dialog.Description class="mt-1 pr-6 text-sm text-muted-foreground"
              >See how an IP address and path match your current rules, without changing anything.</Dialog.Description
            >
            <Dialog.Close
              aria-label="Close rule tester"
              class="absolute top-5 right-5 rounded-button focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden active:scale-[0.98]"
              ><Icon name="close" size={18} /></Dialog.Close
            >
            <Separator.Root class="-mx-5 my-5 block h-px bg-muted" />
            <AccessRulePreview bind:inputRef={previewInput} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AdminAccessRuleDialog disabled={!managed || !loaded || busy} onCreated={created} />
    </div>
  </div>

  {#if !managed}<p class="rounded-input bg-muted p-3 text-sm text-muted-foreground">
      Read-only in this environment. A managed Caddy deployment is required to change IP rules.
    </p>{/if}
  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
  {#if notice}<p role="status" class="flex items-center gap-2 text-sm text-foreground">
      <Icon name="check" size={15} />{notice}
    </p>{/if}

  <div class="overflow-hidden rounded-card border border-border">
    {#if loading}
      <p role="status" class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Icon name="spinner" size={17} class="animate-spin" />Loading IP rules…
      </p>
    {:else if !loaded}
      <div class="flex justify-center p-8">
        <Button variant="outline" onclick={load}>Retry loading IP rules</Button>
      </div>
    {:else if rules.length === 0}
      <div class="flex flex-col items-center px-6 py-10 text-center">
        <div class="mb-3 rounded-card border border-border bg-background-alt p-3 text-muted-foreground">
          <Icon name="admin" size={24} />
        </div>
        <p class="text-sm font-semibold text-foreground">No custom IP rules.</p>
        <p class="mt-1 max-w-sm text-sm text-muted-foreground">
          Traffic follows your normal Anubis policy. Add a rule when you need a temporary exception.
        </p>
      </div>
    {:else}
      <div
        class="flex items-center justify-between border-b border-border bg-background-alt px-4 py-2.5 text-xs text-muted-foreground"
      >
        <span>{rules.length} {rules.length === 1 ? "rule" : "rules"}</span><span
          >First active match wins · Newest first</span
        >
      </div>
      <ul class="divide-y divide-border">
        {#each rules as rule (rule.id)}
          {@const expired = Date.parse(rule.expiresAt) <= now}
          <li class="flex items-start gap-3 p-4 sm:items-center">
            <div class="mt-0.5 shrink-0 rounded-input bg-muted p-2 sm:mt-0">
              <Icon
                name={rule.action === "block" ? "block" : "admin"}
                size={17}
                class={rule.action === "block" ? "text-destructive" : "text-foreground"}
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="text-xs font-medium text-muted-foreground"
                  >{rule.action === "allow" ? "Allow" : "Block"}</span
                >
                <code class="text-sm font-medium break-all text-foreground">{rule.network}</code>
                <span class="rounded-button border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                  >{expired ? "Expired" : rule.enabled ? "Active" : "Disabled"}</span
                >
              </div>
              {#if rule.reason}<p class="mt-1 text-sm break-words text-muted-foreground">{rule.reason}</p>{/if}
              <p class="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <Icon name="clock" size={12} />{expired ? "Expired" : "Expires"}
                <Time iso={rule.expiresAt} />
              </p>
            </div>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                disabled={!managed || busy}
                aria-label={`Actions for ${rule.network}`}
                class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-input text-sm font-medium text-foreground shadow-btn select-none hover:bg-muted active:scale-[0.98] disabled:opacity-50"
                ><Icon name="more" size={18} /></DropdownMenu.Trigger
              >
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  class="z-50 w-[229px] rounded-xl border border-muted bg-background px-1 py-1.5 shadow-popover outline-hidden focus-visible:outline-hidden"
                  sideOffset={8}
                  align="end"
                >
                  <DropdownMenu.Item class={itemClass} disabled={expired} onSelect={() => change(rule)}
                    ><Icon name={rule.enabled ? "shieldOff" : "admin"} size={16} class="mr-2" />{rule.enabled
                      ? "Disable rule"
                      : "Enable rule"}</DropdownMenu.Item
                  >
                  <DropdownMenu.Separator class="-mx-1 my-1 block h-px bg-muted" />
                  <DropdownMenu.Item class={`${itemClass} text-destructive`} onSelect={() => change(rule, true)}
                    ><Icon name="trash" size={16} class="mr-2" />Remove rule</DropdownMenu.Item
                  >
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
    <Icon name="alert" size={15} class="mt-0.5 shrink-0" />
    <p>
      Direct connections only — do not use behind a CDN or another proxy. API, federation and recovery paths stay
      exempt.
    </p>
  </div>
  <Collapsible.Root bind:open={safeguardsOpen}>
    <Collapsible.Trigger>
      {#snippet child({ props })}<Button {...props} variant="ghost" size="sm"
          >Scope & safeguards <Icon name="chevronDown" size={14} class={safeguardsOpen ? "rotate-180" : ""} /></Button
        >{/snippet}
    </Collapsible.Trigger>
    <Collapsible.Content class="mt-2 overflow-hidden">
      <div class="space-y-2 rounded-input bg-muted p-4 text-sm leading-relaxed text-muted-foreground">
        <p>
          Rules apply even with the challenge switch off. Allow skips Anubis, not authentication or rate limits. Blocks
          affect web pages, not the host firewall or SSH.
        </p>
        <p>
          API, federation, feeds, sitemaps, verification files, app assets and sign-in/admin recovery paths keep their
          normal routing and Anubis policy.
        </p>
        <p>
          Every rule expires automatically, within 30 days. At most 100 unexpired rules can be saved, including disabled
          rules. Expired rules cannot be re-enabled.
        </p>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</section>
