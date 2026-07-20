<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import { formatDateTime } from "$lib/format";
  import type { DashboardSummary, PostStat } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const summary = $derived<DashboardSummary>(data.summary);
  const showViews = $derived(summary.onInstanceViews);

  // Compact number formatting (1.2k, 3.4M) so wide counts stay tidy.
  const nf = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  const fmt = (n: number) => nf.format(n);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // Stat cards. Views is dropped when on-instance counting is off, so the
  // dashboard never shows a misleading zero for something it isn't measuring.
  // "Views" counts one reader per day — refreshing can't inflate it.
  type Card = { label: string; value: number; icon: IconName; hint?: string };
  const engagement = $derived(summary.totals.likes + summary.totals.comments);
  const cards = $derived<Card[]>([
    ...(showViews
      ? ([{ label: "Views", value: summary.totals.views, icon: "eye", hint: "Per reader, per day" }] as Card[])
      : []),
    { label: "Likes", value: summary.totals.likes, icon: "heart" },
    { label: "Comments", value: summary.totals.comments, icon: "comment" },
    { label: "Engagement", value: engagement, icon: "sparkles", hint: "Likes + comments" },
    { label: "Followers", value: summary.totals.followers, icon: "users" },
  ]);

  // ── Views-over-time area chart ──────────────────────────────────────────
  // Hand-rolled SVG (no chart dependency — keeps the bundle lean and the design
  // on-theme). A flat baseline of 1 avoids divide-by-zero on an all-quiet range.
  const W = 640;
  const H = 180;
  const PAD = 8; // top breathing room so the peak isn't clipped
  const series = $derived(summary.series);
  const peak = $derived(Math.max(1, ...series.map((d) => d.views)));
  const hasViewData = $derived(showViews && series.some((d) => d.views > 0));
  const rangeTotal = $derived(series.reduce((s, d) => s + d.views, 0));

  // Map each day to an (x, y) point in the viewBox. A single-point series is
  // pinned to the right edge so it still renders a visible marker.
  type Pt = { x: number; y: number; day: string; views: number };
  const points = $derived<Pt[]>(
    series.map((d, i) => ({
      x: series.length === 1 ? W : (i / (series.length - 1)) * W,
      y: H - PAD - (d.views / peak) * (H - PAD * 2),
      day: d.day,
      views: d.views,
    })),
  );
  const linePath = $derived(points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "));
  const areaPath = $derived(
    points.length ? `${linePath} L${points[points.length - 1].x.toFixed(1)} ${H} L${points[0].x.toFixed(1)} ${H} Z` : "",
  );

  // Hover state for the chart. The overlay columns capture the pointer and drive
  // both the highlighted dot and the floating tooltip.
  let hover = $state<number | null>(null);

  // ── Engagement breakdown donut ──────────────────────────────────────────
  // Proportion of total reach by signal. Views is included only when measured.
  type Slice = { label: string; value: number; cls: string };
  const slices = $derived<Slice[]>(
    [
      ...(showViews ? [{ label: "Views", value: summary.totals.views, cls: "text-accent" }] : []),
      { label: "Likes", value: summary.totals.likes, cls: "text-destructive" },
      { label: "Comments", value: summary.totals.comments, cls: "text-foreground" },
    ].filter((s) => s.value > 0),
  );
  const sliceTotal = $derived(Math.max(1, slices.reduce((s, x) => s + x.value, 0)));
  const C = 2 * Math.PI * 42; // donut circumference (r = 42)
  // Pre-compute each arc's dash length and rotation offset around the ring.
  const arcs = $derived(
    slices.reduce<{ label: string; cls: string; len: number; offset: number; share: number }[]>((acc, s) => {
      const share = s.value / sliceTotal;
      const offset = acc.reduce((o, a) => o + a.share, 0);
      acc.push({ label: s.label, cls: s.cls, len: share * C, offset: offset * C, share });
      return acc;
    }, []),
  );

  // ── Per-post table ──────────────────────────────────────────────────────
  // Rows are ranked by raw volume so the most-read posts surface first; the
  // engagement column then shows *how well* each post converts that audience.
  const reach = (p: PostStat) => (showViews ? p.views : 0) + p.likes + p.comments;
  const rankedPosts = $derived<PostStat[]>([...summary.posts].sort((a, b) => reach(b) - reach(a)));

  // Engagement velocity: likes + comments earned per day since publishing. Both
  // signals come from the same population (the fediverse), so there's no mixing
  // of on-instance views with federated engagement. Dividing by post age
  // normalizes for older posts having had longer to accumulate, so a fresh post
  // gaining traction surfaces instead of being buried under months-old totals.
  const DAY = 86_400_000;
  const daysLive = (p: PostStat) => Math.max(1, (Date.now() - new Date(p.createdAt).getTime()) / DAY);
  const engPerDay = (p: PostStat) => (p.likes + p.comments) / daysLive(p);
  const maxPerDay = $derived(Math.max(0.0001, ...summary.posts.map(engPerDay)));

  function engLabel(p: PostStat): string {
    const v = engPerDay(p);
    if (v === 0) return "—";
    return `${v < 9.5 ? v.toFixed(1) : fmt(Math.round(v))}/d`;
  }
  const engFrac = (p: PostStat) => engPerDay(p) / maxPerDay;

  function dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
</script>

<svelte:head><title>Dashboard · Omicron</title></svelte:head>

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="chart" size={22} /> Dashboard
  </h1>
  <p class="mt-1 text-muted-foreground">
    How your writing travels. Aggregate counts only — never who read you.
  </p>
</header>

{#if summary.posts.length === 0}
  <div class="rounded-card border border-border bg-background-alt px-6 py-12 text-center">
    <p class="text-muted-foreground">
      Publish an article and its stats will show up here.
    </p>
  </div>
{:else}
  <!-- Summary cards -->
  <section class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
    {#each cards as card (card.label)}
      <div class="rounded-card border border-border bg-background p-4">
        <div class="flex items-center gap-1.5 text-muted-foreground">
          <Icon name={card.icon} size={15} />
          <span class="text-xs font-medium">{card.label}</span>
        </div>
        <p class="mt-2 text-2xl font-bold tracking-tight text-foreground">{fmt(card.value)}</p>
        {#if card.hint}<p class="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>{/if}
      </div>
    {/each}
  </section>

  {#if !showViews}
    <div class="mt-4 flex items-start gap-2 rounded-card border border-border bg-muted px-4 py-3">
      <Icon name="lock" size={16} />
      <p class="text-sm text-muted-foreground">
        On-instance view counting is turned off for this instance, so only fediverse
        engagement is shown. This is a moderator setting.
      </p>
    </div>
  {/if}

  <div class="mt-6 grid gap-4 lg:grid-cols-3">
    <!-- Views over time (area chart) -->
    {#if hasViewData}
      <section class="rounded-card border border-border bg-background p-5 lg:col-span-2">
        <div class="flex items-baseline justify-between">
          <h2 class="text-sm font-semibold tracking-tight text-foreground">Views over time</h2>
          <span class="text-xs text-muted-foreground">{fmt(rangeTotal)} in the last {series.length} days</span>
        </div>

        <div class="relative mt-4">
          <svg viewBox="0 0 {W} {H}" class="h-44 w-full overflow-visible text-accent" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="currentColor" stop-opacity="0.22" />
                <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
              </linearGradient>
            </defs>
            <!-- baseline grid -->
            {#each [0.25, 0.5, 0.75] as g (g)}
              <line x1="0" x2={W} y1={H * g} y2={H * g} class="stroke-border" stroke-width="1" vector-effect="non-scaling-stroke" />
            {/each}
            <path d={areaPath} fill="url(#viewsFill)" />
            <path d={linePath} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            {#if hover !== null}
              <circle cx={points[hover].x} cy={points[hover].y} r="4" fill="currentColor" vector-effect="non-scaling-stroke" />
            {/if}
          </svg>

          <!-- pointer overlay: one hit-zone per day -->
          <div class="absolute inset-0 flex" role="img" aria-label="Daily views">
            {#each points as p, i (p.day)}
              <button
                type="button"
                class="group relative flex-1 cursor-default"
                onmouseenter={() => (hover = i)}
                onmouseleave={() => (hover = null)}
                onfocus={() => (hover = i)}
                onblur={() => (hover = null)}
                aria-label="{dayLabel(p.day)}: {fmt(p.views)} views"
              >
                {#if hover === i}
                  <span
                    class="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-input border border-border bg-background px-2 py-1 text-xs text-foreground shadow-popover"
                  >
                    {dayLabel(p.day)} · {fmt(p.views)}
                  </span>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <div class="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{dayLabel(series[0].day)}</span>
          <span>{dayLabel(series[series.length - 1].day)}</span>
        </div>
      </section>
    {/if}

    <!-- Engagement breakdown donut -->
    <section class="rounded-card border border-border bg-background p-5 {hasViewData ? '' : 'lg:col-span-3'}">
      <h2 class="text-sm font-semibold tracking-tight text-foreground">Reach breakdown</h2>
      {#if slices.length === 0}
        <p class="mt-4 text-sm text-muted-foreground">No engagement yet.</p>
      {:else}
        <div class="mt-4 flex items-center gap-5">
          <svg viewBox="0 0 100 100" class="h-28 w-28 shrink-0 -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" class="stroke-muted" stroke-width="12" />
            {#each arcs as a (a.label)}
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                class={a.cls}
                stroke="currentColor"
                stroke-width="12"
                stroke-dasharray="{a.len} {C - a.len}"
                stroke-dashoffset={-a.offset}
              />
            {/each}
          </svg>
          <ul class="flex-1 space-y-2 text-sm">
            {#each arcs as a (a.label)}
              <li class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-2 text-muted-foreground">
                  <span class="h-2.5 w-2.5 rounded-full bg-current {a.cls}"></span>
                  {a.label}
                </span>
                <span class="tabular-nums text-foreground">{pct(a.share)}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  </div>

  <!-- Per-post table -->
  <section class="mt-4 rounded-card border border-border bg-background">
    <div class="border-b border-border px-5 py-3">
      <h2 class="text-sm font-semibold tracking-tight text-foreground">Posts</h2>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs text-muted-foreground">
            <th class="px-5 py-2 font-medium">Post</th>
            {#if showViews}
              <th class="px-3 py-2 text-right font-medium">Views</th>
            {/if}
            <th class="px-3 py-2 text-right font-medium">Likes</th>
            <th class="px-3 py-2 text-right font-medium">Comments</th>
            <th class="hidden px-5 py-2 font-medium sm:table-cell">Per day</th>
          </tr>
        </thead>
        <tbody>
          {#each rankedPosts as p, i (p.postId)}
            <tr class="border-t border-border hover:bg-muted">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  {#if i === 0 && reach(p) > 0}
                    <span class="rounded-9px bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-foreground">Top</span>
                  {/if}
                  <a href="/posts/{p.postId}" class="font-medium text-foreground hover:underline">
                    {p.title || "Untitled"}
                  </a>
                </div>
                <p class="mt-0.5 text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
              </td>
              {#if showViews}
                <td class="px-3 py-3 text-right tabular-nums text-foreground">{fmt(p.views)}</td>
              {/if}
              <td class="px-3 py-3 text-right tabular-nums text-foreground">{fmt(p.likes)}</td>
              <td class="px-3 py-3 text-right tabular-nums text-foreground">{fmt(p.comments)}</td>
              <td
                class="hidden px-5 py-3 sm:table-cell"
                title="Likes + comments earned per day since publishing"
              >
                <div class="flex items-center gap-2">
                  <div class="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                    <div class="h-full rounded-full bg-accent" style="width: {Math.max(2, engFrac(p) * 100)}%"></div>
                  </div>
                  <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{engLabel(p)}</span>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}
