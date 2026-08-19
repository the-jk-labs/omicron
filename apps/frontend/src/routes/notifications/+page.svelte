<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import {
    notificationAction,
    notificationHref,
    notificationIcon,
    notificationSubject,
  } from "$lib/components/notifications";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { timeAgo } from "$lib/format";
  import { notifications as bell } from "$lib/notifications.svelte";
  import { timeZone } from "$lib/timezone";
  import type { Notification } from "$lib/types";
  import { onMount, untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let items = $state<Notification[]>(untrack(() => data.page.items));
  let cursor = $state<string | null>(untrack(() => data.page.nextCursor));
  let loading = $state(false);

  // Reset when the page data reloads; "load more" appends to `items` without
  // touching `data`, so it isn't undone (mirrors the drafts page).
  $effect(() => {
    items = data.page.items;
    cursor = data.page.nextCursor;
  });

  // Seeing the page counts as reading everything: clear the server unread state
  // and the nav badge. Rows already rendered keep their unread highlight.
  onMount(() => {
    if (bell.count > 0)
      endpoints()
        .markAllNotificationsRead()
        .catch(() => {});
    bell.clear();
  });

  async function loadMore() {
    if (!cursor) return;
    loading = true;
    try {
      const next = await endpoints().notifications(cursor);
      items = [...items, ...next.items];
      cursor = next.nextCursor;
    } finally {
      loading = false;
    }
  }
</script>

<PageTitle text="Notifications" />

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="bell" size={22} /> Notifications
  </h1>
  <p class="mt-1 text-muted-foreground">Follows, likes, and replies to your posts and comments.</p>
</header>

{#if items.length === 0}
  <div class="rounded-card border border-border bg-background-alt px-6 py-12 text-center">
    <p class="text-muted-foreground">You don't have any notifications yet.</p>
  </div>
{:else}
  <ul class="space-y-1">
    {#each items as n (n.id)}
      {@const href = notificationHref(n)}
      <li>
        <Button
          href={href ?? undefined}
          variant="plain"
          class="flex w-full items-start gap-3 rounded-card px-4 py-3 text-left transition-colors hover:bg-muted {n.read
            ? ''
            : 'bg-muted/40'}"
        >
          <div class="relative shrink-0">
            {#if n.actor}
              <Avatar name={n.actor.displayName} src={n.actor.avatarUrl ?? undefined} size={40} />
              <span
                class="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground"
              >
                <Icon name={notificationIcon(n.type)} size={12} />
              </span>
            {:else}
              <!-- Nobody did this — the instance did. An avatar with a "?" in it
                   would be claiming otherwise, so the icon stands alone. -->
              <div class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon name={notificationIcon(n.type)} size={18} />
              </div>
            {/if}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm leading-snug text-foreground">
              <span class="font-semibold">{notificationSubject(n)}</span>
              {notificationAction(n.type)}
            </p>
            {#if n.postTitle}
              <p class="truncate text-sm text-muted-foreground">{n.postTitle}</p>
            {:else if n.commentSnippet}
              <p class="truncate text-sm text-muted-foreground">{n.commentSnippet}</p>
            {/if}
            <span class="mt-0.5 block text-xs text-muted-foreground">{timeAgo(n.createdAt, $timeZone)}</span>
          </div>
        </Button>
      </li>
    {/each}
  </ul>

  {#if cursor}
    <div class="mt-8 flex justify-center">
      <Button onclick={loadMore} disabled={loading} variant="outline">
        {loading ? "Loading…" : "Load more"}
      </Button>
    </div>
  {/if}
{/if}
