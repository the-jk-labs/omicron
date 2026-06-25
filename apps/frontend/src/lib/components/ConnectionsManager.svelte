<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Tabs } from "bits-ui";
  import { endpoints } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import type { RelationActor } from "$lib/types";

  // One panel per relation kind. Each lazily loads its list the first time its
  // tab is opened, then removes rows optimistically as the action is applied.
  type Kind = "muted" | "blocked";

  type Panel = {
    value: Kind;
    label: string;
    icon: IconName;
    empty: string;
    actionLabel: string;
    load: () => Promise<{ items: RelationActor[] }>;
    act: (a: RelationActor) => Promise<unknown>;
    items: RelationActor[];
    loaded: boolean;
    loading: boolean;
    busy: string | null; // id of the row whose action is in flight
  };

  const api = endpoints();

  function panel(init: Pick<Panel, "value" | "label" | "icon" | "empty" | "actionLabel" | "load" | "act">): Panel {
    return { ...init, items: [], loaded: false, loading: false, busy: null };
  }

  const panels = $state<Panel[]>([
    panel({
      value: "muted",
      label: "Muted",
      icon: "user",
      empty: "You haven't muted anyone.",
      actionLabel: "Unmute",
      load: () => api.muted(),
      act: (a) => (a.remote ? api.remoteUnmute(a.username) : api.unmute(a.username)),
    }),
    panel({
      value: "blocked",
      label: "Blocked",
      icon: "user",
      empty: "You haven't blocked anyone.",
      actionLabel: "Unblock",
      load: () => api.blocked(),
      act: (a) => (a.remote ? api.remoteUnblock(a.username) : api.unblock(a.username)),
    }),
  ]);

  async function ensureLoaded(value: string) {
    const p = panels.find((x) => x.value === value);
    if (!p || p.loaded || p.loading) return;
    p.loading = true;
    try {
      const res = await p.load();
      p.items = res.items;
      p.loaded = true;
    } finally {
      p.loading = false;
    }
  }

  async function applyAction(p: Panel, actor: RelationActor) {
    p.busy = actor.id;
    try {
      await p.act(actor);
      p.items = p.items.filter((a) => a.id !== actor.id);
    } finally {
      p.busy = null;
    }
  }

  // Load the first tab immediately.
  ensureLoaded("muted");
</script>

<Tabs.Root value="muted" onValueChange={ensureLoaded} class="w-full">
  <Tabs.List class="mb-2 flex items-center gap-6 text-sm font-medium">
    {#each panels as p (p.value)}
      <Tabs.Trigger
        value={p.value}
        class="text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-foreground -mb-px inline-flex items-center gap-1.5 border-b border-transparent py-3"
      >
        {p.label}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>

  {#each panels as p (p.value)}
    <Tabs.Content value={p.value} class="pt-2">
      {#if p.loading && p.items.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      {:else if p.items.length === 0}
        <p class="py-6 text-center text-sm text-muted-foreground">{p.empty}</p>
      {:else}
        <ul class="divide-y divide-border">
          {#each p.items as actor (actor.id)}
            <li class="flex items-center justify-between gap-3 py-3">
              <a href={`/@${actor.username}`} class="flex min-w-0 items-center gap-3">
                <Avatar name={actor.displayName} src={actor.avatarUrl ?? undefined} size={40} />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-foreground">
                    {actor.displayName}
                  </span>
                  <span class="block truncate text-xs text-muted-foreground">
                    @{actor.username}
                  </span>
                </span>
              </a>
              <Button
                variant="outline"
                size="sm"
                disabled={p.busy === actor.id}
                onclick={() => applyAction(p, actor)}
              >
                {p.busy === actor.id ? "…" : p.actionLabel}
              </Button>
            </li>
          {/each}
        </ul>
      {/if}
    </Tabs.Content>
  {/each}
</Tabs.Root>
