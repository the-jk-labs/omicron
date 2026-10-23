<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Collapsible } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
  import type { TrafficPoint, TrafficMetrics } from "#lib/types.js";

  let {
    title,
    points,
    metric,
    monthly = false,
  }: { title: string; points: TrafficPoint[]; metric: keyof TrafficMetrics; monthly?: boolean } = $props();
  const id = $props.id();
  const W = 600,
    H = 180,
    LEFT = 8,
    TOP = 12,
    BOTTOM = 12;
  const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const full = new Intl.NumberFormat("en");
  const label = (day: string) =>
    new Date(day).toLocaleDateString("en", {
      timeZone: "UTC",
      month: "short",
      ...(monthly ? { year: "numeric" } : { day: "numeric" }),
    });
  const peak = $derived(Math.max(1, ...points.map((p) => p[metric])));
  const ticks = $derived(peak > 1 ? [peak, Math.round(peak / 2), 0] : [1, 0]);
  const x = (i: number) => (points.length < 2 ? (W + LEFT) / 2 : LEFT + (i * (W - LEFT - 8)) / (points.length - 1));
  const y = (value: number) => H - BOTTOM - (value / peak) * (H - TOP - BOTTOM);
  const line = $derived(points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[metric])}`).join(" "));
  const area = $derived(points.length ? `${line} L${x(points.length - 1)},${H - BOTTOM} L${x(0)},${H - BOTTOM} Z` : "");
  let hover = $state<number | null>(null);
  let tableOpen = $state(false);
  const selected = $derived(hover === null ? null : points[hover]);
  function pointAt(event: PointerEvent) {
    const rect = event.currentTarget instanceof SVGSVGElement ? event.currentTarget.getBoundingClientRect() : null;
    if (!rect || !points.length) return;
    const position = ((event.clientX - rect.left) / rect.width) * W;
    hover = Math.max(
      0,
      Math.min(points.length - 1, Math.round(((position - LEFT) / (W - LEFT - 8)) * (points.length - 1))),
    );
  }
</script>

<section class="min-w-0 rounded-card border border-border bg-background p-5">
  <div class="flex min-h-6 flex-wrap items-baseline justify-between gap-2">
    <h3 {id} class="text-sm font-semibold text-foreground">{title}</h3>
    <span class="text-xs text-muted-foreground tabular-nums">
      {#if selected}{label(selected.day)} · {full.format(selected[metric])}{:else}{monthly ? "Monthly" : "Daily"} · UTC{/if}
    </span>
  </div>
  <div class="relative mt-4 pl-10">
    <div
      class="pointer-events-none absolute inset-y-0 left-0 flex w-8 flex-col items-end justify-between py-2 text-xxs text-muted-foreground tabular-nums"
      aria-hidden="true"
    >
      {#each ticks as tick (tick)}<span>{nf.format(tick)}</span>{/each}
    </div>
    <svg
      viewBox="0 0 {W} {H}"
      class="h-44 w-full overflow-visible text-accent"
      preserveAspectRatio="none"
      role="img"
      aria-labelledby={id}
      onpointermove={pointAt}
      onpointerleave={() => (hover = null)}
    >
      <title>{title}. Exact chart values are available in the data table below.</title>
      <defs
        ><linearGradient id="{id}-fill" x1="0" y1="0" x2="0" y2="1"
          ><stop stop-color="currentColor" stop-opacity="0.18" /><stop
            offset="1"
            stop-color="currentColor"
            stop-opacity="0"
          /></linearGradient
        ></defs
      >
      {#each ticks as tick (tick)}
        <line
          x1={LEFT}
          x2={W}
          y1={y(tick)}
          y2={y(tick)}
          class="stroke-border"
          stroke-dasharray="3 4"
          vector-effect="non-scaling-stroke"
        />
      {/each}
      <path d={area} fill="url(#{id}-fill)" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
      {#if points.length === 1}<circle cx={x(0)} cy={y(points[0][metric])} r="3" fill="currentColor" />{/if}
      {#if selected && hover !== null}
        <line
          x1={x(hover)}
          x2={x(hover)}
          y1={TOP}
          y2={H - BOTTOM}
          class="stroke-foreground-alt"
          stroke-dasharray="3 3"
        />
        <circle cx={x(hover)} cy={y(selected[metric])} r="4" fill="currentColor" />
      {/if}
    </svg>
  </div>
  {#if points.length}
    <div class="mt-1 flex justify-between pl-10 text-xxs text-muted-foreground">
      <span>{label(points[0].day)}</span>{#if points.length > 1}<span>{label(points[points.length - 1].day)}</span>{/if}
    </div>
  {/if}
  <Collapsible.Root bind:open={tableOpen}>
    <Collapsible.Trigger
      class="mt-2 flex items-center gap-1 rounded-input text-xs text-muted-foreground hover:text-foreground"
    >
      <Icon name={tableOpen ? "minus" : "plus"} size={12} />
      {tableOpen ? "Hide" : "Show"} data table
    </Collapsible.Trigger>
    <Collapsible.Content>
      <div class="mt-3 max-h-64 overflow-auto">
        <table class="w-full text-left text-xs">
          <caption class="sr-only">{title}</caption><thead
            ><tr
              ><th class="py-2 font-medium">{monthly ? "Month" : "Date"} (UTC)</th><th
                class="py-2 text-right font-medium">{title}</th
              ></tr
            ></thead
          >
          <tbody
            >{#each points as point (point.day)}<tr class="border-t border-border"
                ><td class="py-2">{monthly ? label(point.day) : point.day}</td><td class="py-2 text-right tabular-nums"
                  >{full.format(point[metric])}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
    </Collapsible.Content>
  </Collapsible.Root>
</section>
