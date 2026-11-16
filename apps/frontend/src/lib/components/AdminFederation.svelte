<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Label, Switch } from "bits-ui";
  import { untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import Time from "#lib/components/Time.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import { countLabel, timeUntil } from "#lib/format.js";
  import type { FederatedInstance, FederationOverview, FederationSettings } from "#lib/types.js";

  // The auto-cache network: which remote instances this one caches ahead of its
  // readers (services/federationSync.ts), and how. `initial` is the server-loaded
  // overview; without it the browser loads it.
  let { initial = null }: { initial?: FederationOverview | null } = $props();
  const seed = untrack(() => initial);

  let overview = $state<FederationOverview | null>(seed);
  let loading = $state(!seed);
  let error = $state("");
  let notice = $state("");

  let interval = $state(seed?.settings.syncIntervalHours ?? 6);
  let authors = $state(seed?.settings.authorsPerInstance ?? 20);
  let savingSettings = $state(false);
  let discovering = $state(false);

  let newDomain = $state("");
  let adding = $state(false);
  let filter = $state("");
  let busy = $state<Record<string, "sync" | "toggle" | "remove" | undefined>>({});

  const settings = $derived(overview?.settings);
  const instances = $derived(overview?.instances ?? []);
  const shown = $derived(
    filter.trim()
      ? instances.filter((i) =>
          `${i.domain} ${i.nodeName ?? ""} ${i.software ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()),
        )
      : instances,
  );
  const totals = $derived({
    tracked: instances.length,
    caching: instances.filter((i) => i.autoCache).length,
    accounts: instances.reduce((n, i) => n + i.cachedAccounts, 0),
    posts: instances.reduce((n, i) => n + i.cachedPosts, 0),
  });
  const numbersDirty = $derived(
    !!settings && (interval !== settings.syncIntervalHours || authors !== settings.authorsPerInstance),
  );
  const numberFormat = new Intl.NumberFormat();

  const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

  async function load() {
    loading = true;
    error = "";
    try {
      overview = await endpoints().federation();
      interval = overview.settings.syncIntervalHours;
      authors = overview.settings.authorsPerInstance;
    } catch (e) {
      error = message(e, "Failed to load the federation network.");
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!seed) load();
  });

  function replace(instance: FederatedInstance) {
    if (!overview) return;
    const rest = overview.instances.filter((i) => i.domain !== instance.domain);
    overview.instances = [...rest, instance].toSorted((a, b) => a.domain.localeCompare(b.domain));
  }

  async function saveSettings(patch: Partial<FederationSettings>) {
    if (!overview) return;
    const before = overview.settings;
    overview.settings = { ...before, ...patch };
    savingSettings = true;
    error = "";
    try {
      overview.settings = await endpoints().setFederationSettings(patch);
      interval = overview.settings.syncIntervalHours;
      authors = overview.settings.authorsPerInstance;
    } catch (e) {
      overview.settings = before;
      error = message(e, "Failed to save.");
    } finally {
      savingSettings = false;
    }
  }

  async function discover() {
    discovering = true;
    error = "";
    notice = "";
    try {
      const run = await endpoints().discoverInstances();
      // Reload first: it clears `error`, which would wipe a failed run's explanation.
      await load();
      if (run.ok) {
        notice =
          run.added > 0
            ? `FediDB lists ${countLabel(run.found, "Omicron instance")}. Added ${run.added} new.`
            : `FediDB lists ${countLabel(run.found, "Omicron instance")}. Nothing new to add.`;
      } else {
        error = `FediDB couldn't be read: ${run.error ?? "unknown error"}. Tracked instances keep syncing.`;
      }
    } catch (e) {
      error = message(e, "Discovery failed.");
    } finally {
      discovering = false;
    }
  }

  async function add() {
    if (!newDomain.trim()) return;
    adding = true;
    error = "";
    notice = "";
    try {
      const { instance } = await endpoints().addInstance(newDomain.trim());
      replace(instance);
      notice = `Tracking ${instance.domain}. It syncs within a few minutes, or use Sync now.`;
      newDomain = "";
    } catch (e) {
      error = message(e, "Failed to add the instance.");
    } finally {
      adding = false;
    }
  }

  async function toggle(instance: FederatedInstance, on: boolean) {
    busy[instance.domain] = "toggle";
    error = "";
    try {
      replace((await endpoints().setInstanceAutoCache(instance.domain, on)).instance);
    } catch (e) {
      error = message(e, "Failed to update the instance.");
    } finally {
      busy[instance.domain] = undefined;
    }
  }

  async function syncNow(instance: FederatedInstance) {
    busy[instance.domain] = "sync";
    error = "";
    notice = "";
    try {
      const { instance: next } = await endpoints().syncInstance(instance.domain);
      replace(next);
      if (next.status === "ok") {
        notice = `Synced ${next.domain}: ${countLabel(next.actorsSynced, "writer")}, ${countLabel(next.postsSynced, "post")} refreshed.`;
      }
    } catch (e) {
      error = message(e, "Sync failed.");
    } finally {
      busy[instance.domain] = undefined;
    }
  }

  async function remove(instance: FederatedInstance) {
    const { ok } = await confirm({
      title: `Stop tracking ${instance.domain}?`,
      description:
        "Nothing more is cached from it ahead of time. What is already cached stays until it ages out, and its writers stay reachable the usual way.",
      confirmText: "Remove",
    });
    if (!ok) return;
    busy[instance.domain] = "remove";
    try {
      await endpoints().removeInstance(instance.domain);
      if (overview) overview.instances = overview.instances.filter((i) => i.domain !== instance.domain);
    } catch (e) {
      error = message(e, "Failed to remove the instance.");
    } finally {
      busy[instance.domain] = undefined;
    }
  }

  type Badge = { label: string; icon: IconName; tone: "neutral" | "strong" | "danger"; spin?: boolean };

  function badge(i: FederatedInstance): Badge {
    if (busy[i.domain] === "sync" || i.syncing)
      return { label: "Syncing", icon: "spinner", tone: "neutral", spin: true };
    if (!i.autoCache) return { label: "Paused", icon: "minus", tone: "neutral" };
    switch (i.status) {
      case "ok":
        return { label: "Synced", icon: "check", tone: "strong" };
      case "unsupported":
        return { label: "Other software", icon: "plug", tone: "neutral" };
      case "error":
        return { label: i.consecutiveFailures > 0 ? "Failing" : "Skipped", icon: "alert", tone: "danger" };
      default:
        return { label: "Waiting", icon: "clock", tone: "neutral" };
    }
  }

  const toneClass = {
    neutral: "border-border bg-background text-muted-foreground",
    strong: "border-foreground/20 bg-muted text-foreground",
    danger: "border-destructive/30 bg-background text-destructive",
  } as const;

  function softwareLine(i: FederatedInstance): string {
    const parts: string[] = [];
    if (i.software) parts.push(i.softwareVersion ? `${i.software} ${i.softwareVersion}` : i.software);
    if (i.userCount !== null) parts.push(`${numberFormat.format(i.userCount)} ${i.userCount === 1 ? "user" : "users"}`);
    if (i.activeMonth !== null) parts.push(`${numberFormat.format(i.activeMonth)} active this month`);
    return parts.join(" · ");
  }

  const field =
    "rounded-input border border-input bg-background shadow-btn px-3.5 py-2.5 text-sm outline-hidden placeholder:text-muted-foreground focus:border-foreground";
  const switchRoot =
    "peer inline-flex h-[28px] min-h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset";
  const switchThumb =
    "pointer-events-none block size-[22px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini";
</script>

{#snippet toggleRow(
  id: string,
  icon: IconName,
  title: string,
  body: string,
  checked: boolean,
  disabled: boolean,
  onChange: (v: boolean) => void,
)}
  <div
    class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 rounded-card border border-border bg-background-alt p-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:p-5"
  >
    <div
      class="hidden size-11 shrink-0 place-items-center rounded-input border border-border bg-background text-foreground sm:grid"
    >
      <Icon name={icon} size={20} />
    </div>
    <div class="min-w-0">
      <Label.Root for={id} class="text-sm font-medium text-foreground">{title}</Label.Root>
      <p class="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
    <Switch.Root {id} {checked} {disabled} onCheckedChange={onChange} class={switchRoot}>
      <Switch.Thumb class={switchThumb} />
    </Switch.Root>
  </div>
{/snippet}

{#if loading && !overview}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else if overview && settings}
  <div class="flex flex-col gap-6">
    {#if !overview.running}
      <div class="flex items-start gap-3 rounded-card border border-border bg-muted p-4 text-sm text-foreground">
        <Icon name="alert" size={18} class="mt-0.5 shrink-0" />
        <p>
          Federation is off on this instance, so nothing is synced or discovered. Turn it on under
          <a href="?tab=settings" class="font-medium underline underline-offset-4">Instance</a>, then restart.
        </p>
      </div>
    {/if}

    <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each [{ label: "Tracked instances", value: totals.tracked }, { label: "Auto-caching", value: totals.caching }, { label: "Cached accounts", value: totals.accounts }, { label: "Cached posts", value: totals.posts }] as stat (stat.label)}
        <div class="rounded-card border border-border bg-background-alt p-4">
          <dt class="text-xs font-medium text-muted-foreground">{stat.label}</dt>
          <dd class="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {numberFormat.format(stat.value)}
          </dd>
        </div>
      {/each}
    </dl>

    <div class="flex flex-col gap-3">
      {@render toggleRow(
        "fed-auto-cache",
        "refresh",
        "Auto-cache the network",
        `Every ${countLabel(settings.syncIntervalHours, "hour")}, refresh the recent writing of each tracked instance, so the Global feed carries it before anyone here looks it up. Posts arrive through ActivityPub with the same checks as any other.`,
        settings.autoCache,
        savingSettings,
        (v) => saveSettings({ autoCache: v }),
      )}
      {@render toggleRow(
        "fed-fedidb",
        "radar",
        "Discover Omicron instances on FediDB",
        "Once a day, track every Omicron instance the FediDB directory lists. One you switch off below stays off.",
        settings.fedidbDiscovery,
        savingSettings || !settings.autoCache,
        (v) => saveSettings({ fedidbDiscovery: v }),
      )}

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-1 text-sm text-muted-foreground">
        {#if overview.discovery}
          <p class="min-w-[14rem] flex-1">
            <Icon
              name={overview.discovery.ok ? "check" : "alert"}
              size={14}
              class="mr-1 inline align-[-2px] {overview.discovery.ok ? '' : 'text-destructive'}"
            />
            {#if overview.discovery.ok}
              FediDB checked <Time iso={overview.discovery.at} relative /> ·
              {countLabel(overview.discovery.found, "instance")} listed
            {:else}
              FediDB unreachable <Time iso={overview.discovery.at} relative />: {overview.discovery.error}
            {/if}
          </p>
        {:else}
          <p class="min-w-[14rem] flex-1">FediDB hasn't been checked yet.</p>
        {/if}
        <Button variant="outline" size="xs" disabled={discovering || !overview.running} onclick={discover}>
          <Icon name={discovering ? "spinner" : "radar"} size={14} class={discovering ? "animate-spin" : ""} />
          {discovering ? "Checking…" : "Check FediDB now"}
        </Button>
      </div>
    </div>

    <form
      class="grid gap-3 rounded-card border border-border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end sm:p-5"
      onsubmit={(e) => (e.preventDefault(), saveSettings({ syncIntervalHours: interval, authorsPerInstance: authors }))}
    >
      <div class="flex flex-col gap-1.5">
        <Label.Root for="fed-interval" class="text-sm leading-none font-medium">Sync every (hours)</Label.Root>
        <input id="fed-interval" type="number" min="1" max="168" step="1" bind:value={interval} class={field} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label.Root for="fed-authors" class="text-sm leading-none font-medium">Writers per instance</Label.Root>
        <input id="fed-authors" type="number" min="1" max="100" step="1" bind:value={authors} class={field} />
      </div>
      <Button variant="solid" type="submit" disabled={!numbersDirty || savingSettings}>
        {savingSettings ? "Saving…" : "Save"}
      </Button>
      <p class="text-xs text-muted-foreground sm:col-span-3">
        Each sync reads the instance's most recent writers and up to 20 posts from each. A failing instance is retried
        less and less often, up to once a week.
      </p>
    </form>

    {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
    {#if notice}<p class="text-sm text-muted-foreground" role="status">{notice}</p>{/if}

    <div>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-sm font-medium text-foreground">Instances</h3>
          <p class="mt-0.5 text-xs text-muted-foreground">
            Writers are found on Omicron instances. Other software still federates follows and replies as usual.
          </p>
        </div>
        {#if instances.length > 6}
          <input
            bind:value={filter}
            placeholder="Filter instances"
            aria-label="Filter instances"
            class="{field} w-full py-2 sm:w-56"
          />
        {/if}
      </div>

      <form class="mt-3 flex flex-col gap-2 sm:flex-row" onsubmit={(e) => (e.preventDefault(), add())}>
        <Label.Root for="fed-add" class="sr-only">Instance domain</Label.Root>
        <input
          id="fed-add"
          bind:value={newDomain}
          placeholder="blog.example.social"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="{field} flex-1"
        />
        <Button variant="outline" type="submit" disabled={adding || !newDomain.trim()}>
          <Icon name="plus" size={15} />
          {adding ? "Adding…" : "Add instance"}
        </Button>
      </form>

      {#if instances.length === 0}
        <div class="mt-4 rounded-card border border-dashed border-border p-8 text-center">
          <Icon name="server" size={22} class="mx-auto text-muted-foreground" />
          <p class="mt-2 text-sm text-foreground">No instances tracked yet.</p>
          <p class="mt-1 text-xs text-muted-foreground">
            Add one above{settings.fedidbDiscovery ? ", or let FediDB discovery fill this in" : ""}.
          </p>
        </div>
      {:else if shown.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">No instance matches “{filter}”.</p>
      {:else}
        <ul class="mt-4 flex flex-col divide-y divide-border rounded-card border border-border">
          {#each shown as instance (instance.domain)}
            {@const b = badge(instance)}
            <li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div
                class="hidden size-10 shrink-0 place-items-center rounded-input border border-border bg-background-alt text-muted-foreground sm:grid"
              >
                <Icon name="server" size={18} />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <a
                    href="https://{instance.domain}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate font-medium text-foreground hover:underline">{instance.domain}</a
                  >
                  <span
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {toneClass[
                      b.tone
                    ]}"
                  >
                    <Icon name={b.icon} size={12} class={b.spin ? "animate-spin" : ""} />
                    {b.label}
                  </span>
                  <span class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {instance.source === "fedidb" ? "FediDB" : "Added by hand"}
                  </span>
                </div>
                {#if instance.nodeName || softwareLine(instance)}
                  <p class="mt-1 truncate text-xs text-muted-foreground">
                    {[instance.nodeName, softwareLine(instance)].filter(Boolean).join(" · ")}
                  </p>
                {/if}
                <p class="mt-1 text-xs text-muted-foreground">
                  {countLabel(instance.cachedAccounts, "account")} and {countLabel(instance.cachedPosts, "post")} cached
                  {#if instance.lastSuccessAt}
                    · synced <Time iso={instance.lastSuccessAt} relative />
                  {/if}
                  {#if instance.autoCache && !instance.syncing}
                    · next sync {timeUntil(instance.nextSyncAt)}
                  {/if}
                </p>
                {#if instance.lastError}
                  <p class="mt-1 text-xs {instance.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}">
                    {instance.lastError}
                  </p>
                {/if}
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <Label.Root for="fed-{instance.domain}" class="sr-only">Auto-cache {instance.domain}</Label.Root>
                <Switch.Root
                  id="fed-{instance.domain}"
                  checked={instance.autoCache}
                  disabled={!!busy[instance.domain]}
                  onCheckedChange={(v) => toggle(instance, v)}
                  class={switchRoot}
                >
                  <Switch.Thumb class={switchThumb} />
                </Switch.Root>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy[instance.domain] || instance.syncing || !overview.running}
                  onclick={() => syncNow(instance)}
                >
                  <Icon name="refresh" size={14} class={busy[instance.domain] === "sync" ? "animate-spin" : ""} />
                  Sync now
                </Button>
                {#if instance.source === "manual"}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove {instance.domain}"
                    disabled={!!busy[instance.domain]}
                    onclick={() => remove(instance)}
                  >
                    <Icon name="trash" size={15} />
                  </Button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{:else if error}
  <p class="text-sm text-destructive" role="alert">{error}</p>
{/if}
