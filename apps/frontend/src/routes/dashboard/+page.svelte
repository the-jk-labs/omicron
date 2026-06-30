<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import { formatDate } from "$lib/format";
  import type { DashboardSummary, PostStat } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const summary = $derived<DashboardSummary>(data.summary);
  const showViews = $derived(summary.onInstanceViews);

  // Compact number formatting (1.2k, 3.4M) so wide counts stay tidy.
  const nf = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
  const fmt = (n: number) => nf.format(n);

  // Stat cards. Views is dropped when on-instance counting is off, so the
  // dashboard never shows a misleading zero for something it isn't measuring.
  // "Views" counts one reader per day — refreshing can't inflate it.
  type Card = { label: string; value: number; icon: IconName; hint?: string };
  const cards = $derived<Card[]>([
    ...(showViews
      ? ([{ label: "Views", value: summary.totals.views, icon: "eye", hint: "Per reader, per day" }] as Card[])
      : []),
    { label: "Likes", value: summary.totals.likes, icon: "heart" },
    { label: "Comments", value: summary.totals.comments, icon: "comment" },
    { label: "Followers", value: summary.totals.followers, icon: "users" },
  ]);

  // Bar chart geometry. Bars are scaled to the busiest day; a flat baseline of 1
  // avoids divide-by-zero on an all-quiet range.
  const peak = $derived(Math.max(1, ...summary.series.map((d) => d.views)));
  const hasViewData = $derived(showViews && summary.series.some((d) => d.views > 0));

  // Posts sorted by reach: by views when measured, else by engagement.
  const rankedPosts = $derived<PostStat[]>(
    [...summary.posts].sort((a, b) =>
      showViews ? b.views - a.views : (b.likes + b.comments) - (a.likes + a.comments)
    ),
  );

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
      Publish a story and its stats will show up here.
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

  <!-- Views over time -->
  {#if hasViewData}
    <section class="mt-6 rounded-card border border-border bg-background p-5">
      <h2 class="text-sm font-semibold tracking-tight text-foreground">Views over time</h2>
      <div class="mt-4 flex h-32 items-end gap-1" role="img" aria-label="Daily views">
        {#each summary.series as d (d.day)}
          <div class="group relative flex flex-1 flex-col items-center justify-end">
            <div
              class="w-full rounded-9px bg-accent transition-colors group-hover:bg-foreground"
              style="height: {Math.round((d.views / peak) * 100)}%"
            ></div>
            <span
              class="pointer-events-none absolute -top-7 hidden whitespace-nowrap rounded-input border border-border bg-background px-2 py-1 text-xs text-foreground shadow-popover group-hover:block"
            >
              {dayLabel(d.day)} · {fmt(d.views)}
            </span>
          </div>
        {/each}
      </div>
      <div class="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{dayLabel(summary.series[0].day)}</span>
        <span>{dayLabel(summary.series[summary.series.length - 1].day)}</span>
      </div>
    </section>
  {/if}

  <!-- Per-post table -->
  <section class="mt-6 rounded-card border border-border bg-background">
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
            <th class="px-5 py-2 text-right font-medium">Comments</th>
          </tr>
        </thead>
        <tbody>
          {#each rankedPosts as p (p.postId)}
            <tr class="border-t border-border hover:bg-muted">
              <td class="px-5 py-3">
                <a href="/posts/{p.postId}" class="font-medium text-foreground hover:underline">
                  {p.title || "Untitled"}
                </a>
                <p class="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
              </td>
              {#if showViews}
                <td class="px-3 py-3 text-right tabular-nums text-foreground">{fmt(p.views)}</td>
              {/if}
              <td class="px-3 py-3 text-right tabular-nums text-foreground">{fmt(p.likes)}</td>
              <td class="px-5 py-3 text-right tabular-nums text-foreground">{fmt(p.comments)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/if}
