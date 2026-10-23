<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { invalidateAll, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { Label, Select, Switch, Collapsible } from "bits-ui";
  import { onMount, untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import TrafficChart from "#lib/components/TrafficChart.svelte";
  import TrafficRanking from "#lib/components/TrafficRanking.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { countryName, presetRange, trafficChange, TRAFFIC_PRESETS } from "#lib/traffic.js";
  import type { TrafficMetrics, TrafficSummary } from "#lib/types.js";

  let { initial = null }: { initial?: TrafficSummary | null } = $props();
  const seed = untrack(() => initial);
  let summary = $state<TrafficSummary | null>(seed);
  let loading = $state(!seed);
  let saving = $state(false);
  let error = $state("");
  function identifyPreset(range: { from: string; to: string }): string {
    return (
      TRAFFIC_PRESETS.find((option) => {
        const candidate = presetRange(option.value);
        return candidate.from === range.from && candidate.to === range.to;
      })?.value ?? "custom"
    );
  }
  let preset = $state(seed ? identifyPreset(seed.range) : "30d");
  const rangeItems = $derived(
    preset === "custom"
      ? [...TRAFFIC_PRESETS, { value: "custom", label: "Selected dates", disabled: true }]
      : [...TRAFFIC_PRESETS],
  );
  let requested = $state(seed ? { from: seed.range.from, to: seed.range.to } : null);
  let requestId = 0;
  let monthly = $state((seed?.range.days ?? 0) > 90);
  const full = new Intl.NumberFormat("en");
  const date = (day: string) =>
    new Date(day).toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const cards: { metric: keyof TrafficMetrics; label: string; hint: string }[] = [
    { metric: "visitors", label: "Unique visitors", hint: "Estimated distinct browsers" },
    { metric: "pageviews", label: "Pageviews", hint: "Public page loads and navigations" },
    { metric: "visits", label: "Visits", hint: "New visit after 30 minutes inactive" },
  ];
  const points = $derived(summary ? (monthly ? summary.monthly : summary.series) : []);
  const baselineIncomplete = $derived(
    !!summary && (!summary.firstDay || summary.firstDay > summary.range.previousFrom),
  );
  const showGeography = $derived(
    !!summary && (summary.geographyAvailable || summary.breakdowns.country.some((row) => /^[A-Z]{2}$/.test(row.value))),
  );
  const mapModule = $derived(showGeography ? import("#lib/components/TrafficMap.svelte") : null);

  async function reload(range = requested ?? undefined) {
    const id = ++requestId;
    loading = true;
    error = "";
    try {
      const next = await endpoints().adminTraffic(range);
      if (id !== requestId) return;
      summary = next;
      preset = identifyPreset(next.range);
      if (id === 1 && !seed) monthly = next.range.days > 90;
      requested = { from: next.range.from, to: next.range.to };
    } catch (e) {
      if (id === requestId) error = e instanceof ApiError ? e.message : "Could not load traffic analytics.";
    } finally {
      if (id === requestId) loading = false;
    }
  }

  onMount(() => {
    if (seed) return;
    const from = page.url.searchParams.get("trafficFrom");
    const to = page.url.searchParams.get("trafficTo");
    void reload(from && to ? { from, to } : undefined);
  });

  function selectRange(value: string) {
    const selected = TRAFFIC_PRESETS.find((p) => p.value === value);
    if (!selected) return;
    preset = selected.value;
    requested = presetRange(selected.value);
    monthly = preset === "365d";
    const url = new URL(page.url.href);
    url.searchParams.set("tab", "traffic");
    url.searchParams.set("trafficFrom", requested.from);
    url.searchParams.set("trafficTo", requested.to);
    replaceState(url, {});
    void reload(requested);
  }

  async function toggle(enabled: boolean) {
    saving = true;
    error = "";
    const previous = summary?.enabled ?? false;
    if (summary) summary = { ...summary, enabled };
    try {
      const result = await endpoints().setTrafficEnabled(enabled);
      if (summary) summary = { ...summary, enabled: result.enabled };
      await invalidateAll().catch(() => {});
    } catch (e) {
      if (summary) summary = { ...summary, enabled: previous };
      error = e instanceof ApiError ? e.message : "Could not save traffic settings.";
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-6">
  <header class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h2 class="text-lg font-semibold tracking-tight text-foreground">Site traffic</h2>
      <p class="mt-1 text-sm text-muted-foreground">Understand your audience. See how your instance grows.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Select.Root type="single" value={preset} onValueChange={selectRange} items={rangeItems} disabled={saving}>
        <Select.Trigger
          class="inline-flex h-input w-[296px] max-w-full touch-none items-center rounded-9px border border-border-input bg-background px-[11px] text-sm transition-colors select-none data-placeholder:text-foreground-alt/50"
          aria-label="Traffic date range"
        >
          <Icon name="calendar" size={16} class="mr-2 text-muted-foreground" /><Select.Value /><Icon
            name="chevronDown"
            size={16}
            class="ml-auto text-muted-foreground"
          />
        </Select.Trigger>
        <Select.Portal
          ><Select.Content
            class="focus-override data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 h-96 max-h-[var(--bits-select-content-available-height)] w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] rounded-xl border border-muted bg-background px-1 py-3 shadow-popover outline-hidden select-none data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1"
            sideOffset={10}
          >
            <Select.Viewport class="p-1"
              >{#each rangeItems as option (option.value)}<Select.Item
                  value={option.value}
                  label={option.label}
                  disabled={"disabled" in option && option.disabled}
                  class="flex h-10 w-full items-center rounded-button py-3 pr-1.5 pl-5 text-sm capitalize outline-hidden select-none data-disabled:opacity-50 data-highlighted:bg-muted"
                  >{option.label}</Select.Item
                >{/each}</Select.Viewport
            >
          </Select.Content></Select.Portal
        >
      </Select.Root>
      <Button variant="outline" class="h-input" disabled={loading || saving} onclick={() => reload()}>Refresh</Button>
    </div>
  </header>

  {#if error}<div
      role="alert"
      class="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-background p-4 text-sm text-destructive"
    >
      <p>{error}</p>
      <Button size="sm" onclick={() => reload()} disabled={loading}>Retry</Button>
    </div>{/if}

  {#if summary}
    <section
      class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-card border border-border bg-background p-5"
    >
      <Label.Root for="traffic-collection" class="text-sm font-medium text-foreground"
        >Traffic collection {summary.enabled ? "enabled" : "disabled"}</Label.Root
      >
      <Switch.Root
        id="traffic-collection"
        checked={summary.enabled}
        onCheckedChange={toggle}
        disabled={saving || loading}
        class="peer inline-flex h-[36px] min-h-[36px] w-[60px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
      >
        <Switch.Thumb
          class="pointer-events-none block size-[30px] shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-[24px] data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
        />
      </Switch.Root>
      <p class="col-span-2 max-w-prose text-xs leading-relaxed text-muted-foreground">
        Uses first-party visitor and 30-minute visit cookies. Only aggregate counters are saved; no IPs, raw user
        agents, or visitor histories. DNT/GPC are honored. Before enabling, update your privacy policy and obtain
        consent where required.
      </p>
    </section>
    {#if !summary.enabled}<p class="rounded-card border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        Collection is off. Historical statistics remain available. Enable it to start measuring new visits; past traffic
        cannot be reconstructed.
      </p>{/if}
  {/if}

  {#if loading}<div
      role="status"
      class="rounded-card border border-border bg-background p-12 text-center text-sm text-muted-foreground"
    >
      Loading traffic analytics…
    </div>
  {:else if summary}
    <div class="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
      <p>{date(summary.range.from)} – {date(summary.range.to)} · UTC</p>
      <p>Compared with {date(summary.range.previousFrom)} – {date(summary.range.previousTo)}</p>
    </div>
    {#if baselineIncomplete}<p class="text-xs text-muted-foreground">
        The comparison period has limited or no recorded history. Growth percentages may not reflect a full baseline.
      </p>{/if}
    <div class="grid gap-3 sm:grid-cols-3">
      {#each cards as card (card.metric)}
        <section class="rounded-card border border-border bg-background p-5">
          <h3 class="text-sm text-muted-foreground">{card.label}</h3>
          <div class="mt-2 flex flex-wrap items-baseline gap-3">
            <p class="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
              {full.format(summary.totals[card.metric])}
            </p>
            <span class="text-xs text-foreground-alt tabular-nums"
              >{trafficChange(summary.totals[card.metric], summary.previous[card.metric])}</span
            >
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{card.hint}</p>
        </section>
      {/each}
    </div>
    {#if summary.totals.pageviews === 0}<p
        class="rounded-card border border-border bg-background-alt px-5 py-8 text-center text-sm text-muted-foreground"
      >
        No pageviews recorded in this period. Once collection is enabled, public visits from non-staff browsers will
        appear here.
      </p>{/if}
    <div class="flex justify-end">
      <Button size="xs" variant="outline" onclick={() => (monthly = !monthly)}
        >Group by: {monthly ? "Month" : "Day"}</Button
      >
    </div>
    <div class="grid gap-4 xl:grid-cols-2">
      <TrafficChart title="Pageviews over time" {points} metric="pageviews" {monthly} /><TrafficChart
        title="Unique visitors over time"
        {points}
        metric="visitors"
        {monthly}
      />
    </div>
    <TrafficChart title="Visits over time" {points} metric="visits" {monthly} />
    <div>
      <h2 class="mb-3 text-base font-semibold text-foreground">Content and discovery</h2>
      <div class="grid gap-4 xl:grid-cols-2">
        <TrafficRanking
          title="Top pages"
          rows={summary.breakdowns.path}
          total={summary.totals.pageviews}
        /><TrafficRanking title="Top referrers" rows={summary.breakdowns.referrer} total={summary.totals.pageviews} />
      </div>
    </div>
    <div>
      <h2 class="mb-3 text-base font-semibold text-foreground">Geography</h2>
      {#if showGeography}
        <div class="grid gap-4 xl:grid-cols-2">
          {#await mapModule}
            <section
              class="rounded-card border border-border bg-background p-5 text-sm text-muted-foreground"
              role="status"
            >
              Loading country map…
            </section>
          {:then loaded}
            {#if loaded}<loaded.default rows={summary.breakdowns.country} />{/if}
          {:catch}
            <section class="rounded-card border border-border bg-background p-5 text-sm text-muted-foreground">
              The map could not load. Country counts remain available.
            </section>
          {/await}
          <TrafficRanking
            title="Top countries"
            rows={summary.breakdowns.country}
            total={summary.totals.pageviews}
            label={countryName}
          />
        </div>
        {#if !summary.geographyAvailable}<p class="mt-2 text-xs text-muted-foreground">
            The country database is currently unavailable. These are historical country counts; new traffic is
            classified as Unknown.
          </p>{/if}
      {:else}<section class="rounded-card border border-border bg-background p-5">
          <p class="text-sm text-muted-foreground">
            Country lookup is not configured. To enable it, mount a local MaxMind-compatible country database and set <code
              class="text-foreground">TRAFFIC_GEOIP_PATH</code
            > in the backend. No external lookup service is used, and country headers from visitors are never trusted. Existing
            Unknown counts cannot be backfilled.
          </p>
        </section>{/if}
    </div>
    <div>
      <h2 class="mb-3 text-base font-semibold text-foreground">Technology</h2>
      <div class="grid gap-4 xl:grid-cols-3">
        <TrafficRanking
          title="Devices"
          rows={summary.breakdowns.device}
          total={summary.totals.pageviews}
        /><TrafficRanking
          title="Browsers"
          rows={summary.breakdowns.browser}
          total={summary.totals.pageviews}
        /><TrafficRanking title="Operating systems" rows={summary.breakdowns.os} total={summary.totals.pageviews} />
      </div>
    </div>
    <Collapsible.Root
      ><Collapsible.Trigger
        class="flex items-center gap-2 rounded-input text-sm font-medium text-foreground hover:text-foreground-alt"
        ><Icon name="chevronDown" size={15} /> How to read these numbers</Collapsible.Trigger
      ><Collapsible.Content class="mt-3 space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          Visitors and visits are statistical estimates (HyperLogLog, about 1.6% standard error), not verified people.
          Multiple devices, private browsing, deleted cookies, or cookies older than 400 days may count the same person
          again. Estimates are merged across days, never added together.
        </p>
        <p>
          A pageview is a successful, visible public-page load or client-side navigation. Refreshes count again;
          hash/query-only changes do not. Private content, account/admin pages, staff browsers, known bots, API calls,
          assets, federation and RSS requests are excluded. Blocked scripts, disabled cookies, unknown bots and failed
          requests affect accuracy. This is not a raw network-request dashboard.
        </p>
        <p>
          A visit expires after 30 minutes without a measured pageview. A visit crossing midnight is unique in each
          daily bucket but counted once across the selected period. Referrers describe individual pageviews; same-site
          and missing referrers are grouped together.
        </p>
        <p>
          All dates use UTC. Today and the current month are incomplete. Comparisons use the immediately preceding equal
          number of days. Monthly groups at the edges of a range may be partial. Daily aggregates are kept for 730 days.
          Collection gaps cannot be reconstructed. High-cardinality dimensions are limited to 500 distinct values per
          day; overflow is grouped as Other.
        </p>
        {#if summary.firstDay}<p>Earliest retained traffic: {date(summary.firstDay)}.</p>{/if}
      </Collapsible.Content></Collapsible.Root
    >
  {/if}
</div>
