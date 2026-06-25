<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { endpoints } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { RelationActor } from "$lib/types";

  // The clickable follower/following count on a profile. Opens a dialog that
  // lazily loads the list the first time it's opened (like other platforms).
  let {
    username,
    kind,
    title,
    children,
  }: {
    username: string;
    kind: "followers" | "following";
    title: string;
    children: import("svelte").Snippet;
  } = $props();

  let open = $state(false);
  let items = $state<RelationActor[]>([]);
  let loaded = $state(false);
  let loading = $state(false);

  async function onOpenChange(next: boolean) {
    open = next;
    if (!next || loaded || loading) return;
    loading = true;
    try {
      const res = kind === "followers"
        ? await endpoints().userFollowers(username)
        : await endpoints().userFollowing(username);
      items = res.items;
      loaded = true;
    } finally {
      loading = false;
    }
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Trigger
    class="rounded-button -mx-1 px-1 hover:text-foreground focus-visible:outline-none"
  >
    {@render children()}
  </Dialog.Trigger>

  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 flex-col border border-border sm:max-w-[440px]"
    >
      <div class="flex items-center justify-between border-b border-border px-5 py-4">
        <Dialog.Title class="text-foreground text-base font-semibold tracking-tight">
          {title}
        </Dialog.Title>
        <Dialog.Close
          class="text-muted-foreground hover:text-foreground focus-visible:outline-none"
          aria-label="Close"
        >
          <Icon name="close" size={18} />
        </Dialog.Close>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {#if loading && items.length === 0}
          <p class="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        {:else if items.length === 0}
          <p class="py-8 text-center text-sm text-muted-foreground">
            {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
          </p>
        {:else}
          <ul>
            {#each items as actor (actor.id)}
              <li>
                <a
                  href={`/@${actor.username}`}
                  onclick={() => (open = false)}
                  class="flex items-center gap-3 rounded-card px-3 py-2.5 hover:bg-muted"
                >
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
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
