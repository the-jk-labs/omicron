<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Button, Dialog } from "bits-ui";
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
    canRemove = false,
    onRemoved,
    children,
  }: {
    username: string;
    kind: "followers" | "following";
    title: string;
    // When true (own followers list), each row gets a "Remove" action that
    // forcibly drops that follower — Instagram/Mastodon "Remove follower".
    canRemove?: boolean;
    // Called after a follower is removed, so the caller can decrement its count.
    onRemoved?: () => void;
    children: import("svelte").Snippet;
  } = $props();

  let open = $state(false);
  let items = $state<RelationActor[]>([]);
  let loaded = $state(false);
  let loading = $state(false);
  // Follower ids awaiting a second click to confirm removal.
  let confirming = $state<Set<string>>(new Set());
  let removing = $state<Set<string>>(new Set());

  async function removeFollower(actor: RelationActor) {
    if (!confirming.has(actor.id)) {
      confirming = new Set(confirming).add(actor.id);
      return;
    }
    removing = new Set(removing).add(actor.id);
    try {
      await endpoints().removeFollower(actor.username);
      items = items.filter((a) => a.id !== actor.id);
      onRemoved?.();
    } finally {
      removing.delete(actor.id);
      removing = new Set(removing);
      confirming.delete(actor.id);
      confirming = new Set(confirming);
    }
  }

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
              <li class="flex items-center gap-1 rounded-card pr-2 hover:bg-muted">
                <a
                  href={`/@${actor.username}`}
                  onclick={() => (open = false)}
                  class="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5"
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
                {#if canRemove}
                  <Button.Root
                    onclick={() => removeFollower(actor)}
                    disabled={removing.has(actor.id)}
                    class="rounded-input shrink-0 border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-btn hover:bg-muted disabled:opacity-50 data-[confirm]:border-destructive data-[confirm]:text-destructive focus-visible:outline-none"
                    data-confirm={confirming.has(actor.id) ? "" : undefined}
                  >
                    {confirming.has(actor.id) ? "Confirm" : "Remove"}
                  </Button.Root>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
