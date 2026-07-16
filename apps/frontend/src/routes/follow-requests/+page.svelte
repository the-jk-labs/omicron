<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { untrack } from "svelte";
  import { endpoints } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { timeAgo } from "$lib/format";
  import type { FollowRequest } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let items = $state<FollowRequest[]>(untrack(() => data.requests));
  // Reset when the page data reloads (e.g. navigating back to it).
  $effect(() => {
    items = data.requests;
  });
  // Ids currently being approved/rejected, so their buttons disable individually.
  let busy = $state<Record<string, boolean>>({});

  async function act(req: FollowRequest, approve: boolean) {
    busy = { ...busy, [req.requestId]: true };
    try {
      await (approve
        ? endpoints().approveFollowRequest(req.requestId)
        : endpoints().rejectFollowRequest(req.requestId));
      items = items.filter((r) => r.requestId !== req.requestId);
    } finally {
      busy = { ...busy, [req.requestId]: false };
    }
  }
</script>

<svelte:head><title>Follow requests · Omicron</title></svelte:head>

<header class="mb-6 pb-2">
  <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
    <Icon name="lock" size={22} /> Follow requests
  </h1>
  <p class="mt-1 text-muted-foreground">People asking to follow your private account.</p>
</header>

{#if items.length === 0}
  <div class="rounded-card border border-border bg-background-alt px-6 py-12 text-center">
    <p class="text-muted-foreground">You have no pending follow requests.</p>
  </div>
{:else}
  <ul class="space-y-1">
    {#each items as req (req.requestId)}
      <li class="flex items-center gap-3 rounded-card px-4 py-3 transition-colors hover:bg-muted">
        <a href={`/@${req.actor.username}`} class="shrink-0">
          <Avatar name={req.actor.displayName} src={req.actor.avatarUrl ?? undefined} size={40} />
        </a>
        <div class="min-w-0 flex-1">
          <a href={`/@${req.actor.username}`} class="block truncate text-sm font-semibold text-foreground hover:underline">
            {req.actor.displayName}
          </a>
          <p class="truncate text-xs text-muted-foreground">
            @{req.actor.username} · {timeAgo(req.createdAt)}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="solid"
            disabled={busy[req.requestId]}
            onclick={() => act(req, true)}
          >
            <Icon name="check" size={15} /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy[req.requestId]}
            onclick={() => act(req, false)}
          >
            <Icon name="close" size={15} /> Reject
          </Button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
