<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  let {
    title,
    rows,
    total,
    label = (value: string) => value,
  }: {
    title: string;
    rows: { value: string; pageviews: number }[];
    total: number;
    label?: (value: string) => string;
  } = $props();
  const nf = new Intl.NumberFormat("en");
  const largest = $derived(Math.max(1, ...rows.map((r) => r.pageviews)));
</script>

<section class="min-w-0 rounded-card border border-border bg-background p-5">
  <div class="mb-4 flex items-baseline justify-between gap-2">
    <h3 class="text-sm font-semibold text-foreground">{title}</h3>
    <span class="text-xs text-muted-foreground">Pageviews</span>
  </div>
  {#if !rows.length}<p class="py-8 text-center text-sm text-muted-foreground">No traffic recorded for this period.</p>
  {:else}
    <ol class="space-y-3">
      {#each rows.slice(0, 10) as row (row.value)}
        <li class="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-3 text-sm">
          <span class="truncate text-foreground" title={label(row.value)}>{label(row.value)}</span>
          <svg viewBox="0 0 100 6" class="h-1.5 w-20 rounded-full bg-muted" aria-hidden="true"
            ><rect width={(row.pageviews / largest) * 100} height="6" rx="3" class="fill-accent" /></svg
          >
          <span
            class="min-w-12 text-right text-xs text-foreground tabular-nums"
            title="{total ? ((row.pageviews / total) * 100).toFixed(1) : 0}% of pageviews"
            >{nf.format(row.pageviews)}</span
          >
        </li>
      {/each}
    </ol>
  {/if}
</section>
