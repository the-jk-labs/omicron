<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Popover } from "bits-ui";
  import { endpoints, ApiError } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import type { ReadingList } from "$lib/types";

  // "Save to list" control — the reading-list analogue of YouTube's Save button.
  // Opens a popover of the signed-in user's lists (Read later pinned first),
  // each toggled on/off for this post, plus an inline "create new list" field.
  // A popover (not a dropdown menu) so the text input behaves normally.
  let { postId, signedIn }: { postId: string; signedIn: boolean } = $props();

  let open = $state(false);
  let lists = $state<ReadingList[]>([]);
  let loaded = $state(false);
  let loading = $state(false);
  let busy = $state<Set<string>>(new Set());
  let newTitle = $state("");
  let creating = $state(false);
  let error = $state("");

  // Filled bookmark once the post is saved to at least one list.
  const saved = $derived(lists.some((l) => l.contains));

  async function onOpenChange(next: boolean) {
    open = next;
    if (!next || loaded || loading) return;
    loading = true;
    try {
      lists = (await endpoints().listsForPost(postId)).lists;
      loaded = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Couldn't load your lists.";
    } finally {
      loading = false;
    }
  }

  async function toggle(list: ReadingList) {
    if (busy.has(list.id)) return;
    busy = new Set(busy).add(list.id);
    const wasIn = !!list.contains;
    try {
      if (wasIn) await endpoints().removeFromList(list.id, postId);
      else await endpoints().addToList(list.id, postId);
      lists = lists.map((l) =>
        l.id === list.id
          ? { ...l, contains: !wasIn, itemCount: l.itemCount + (wasIn ? -1 : 1) }
          : l,
      );
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Something went wrong.";
    } finally {
      const next = new Set(busy);
      next.delete(list.id);
      busy = next;
    }
  }

  // Create a new list (public by default) and drop this post straight into it.
  async function createAndAdd() {
    const title = newTitle.trim();
    if (!title || creating) return;
    creating = true;
    error = "";
    try {
      const { list } = await endpoints().createList({ title });
      await endpoints().addToList(list.id, postId);
      lists = [...lists, { ...list, contains: true, itemCount: 1 }];
      newTitle = "";
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Couldn't create the list.";
    } finally {
      creating = false;
    }
  }
</script>

{#if signedIn}
  <Popover.Root bind:open {onOpenChange}>
    <Popover.Trigger
      title="Save"
      aria-label="Save to a reading list"
      class="inline-flex items-center gap-1.5 rounded-button text-muted-foreground hover:text-foreground focus-visible:outline-none"
    >
      <Icon name={saved ? "bookmarkCheck" : "bookmark"} size={18} />
    </Popover.Trigger>

    <Popover.Portal>
      <Popover.Content
        sideOffset={8}
        align="end"
        class="border-muted bg-background shadow-popover z-30 w-[260px] rounded-xl border p-1.5 focus-visible:outline-none"
      >
        <p class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Save to…</p>

        {#if loading}
          <p class="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
        {:else}
          <div class="max-h-56 overflow-y-auto">
            {#each lists as list (list.id)}
              <button
                type="button"
                onclick={() => toggle(list)}
                disabled={busy.has(list.id)}
                class="rounded-button hover:bg-muted flex w-full items-center gap-2.5 px-2 py-2 text-left text-sm text-foreground focus-visible:outline-none disabled:opacity-60"
              >
                <span
                  class="flex size-4 shrink-0 items-center justify-center rounded border {list.contains
                    ? 'bg-foreground border-foreground text-background'
                    : 'border-border'}"
                >
                  {#if list.contains}<Icon name="check" size={12} />{/if}
                </span>
                <span class="min-w-0 flex-1 truncate">{list.title}</span>
                {#if list.visibility === "private"}
                  <Icon name="lock" size={13} class="shrink-0 text-muted-foreground" />
                {/if}
              </button>
            {/each}
          </div>

          <div class="my-1.5 h-px bg-border"></div>

          <form
            onsubmit={(e) => {
              e.preventDefault();
              createAndAdd();
            }}
            class="flex items-center gap-1.5 px-1 pb-0.5"
          >
            <input
              bind:value={newTitle}
              placeholder="New list"
              maxlength="100"
              class="rounded-input border-border bg-background h-8 min-w-0 flex-1 border px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
            />
            <button
              type="submit"
              disabled={!newTitle.trim() || creating}
              aria-label="Create list"
              class="rounded-button text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-8 shrink-0 items-center justify-center focus-visible:outline-none disabled:opacity-50"
            >
              <Icon name="plus" size={16} />
            </button>
          </form>

          {#if error}<p class="px-2 pt-1 text-xs text-destructive">{error}</p>{/if}
        {/if}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
{:else}
  <a
    href="/login"
    title="Save"
    aria-label="Sign in to save"
    class="inline-flex items-center gap-1.5 rounded-button text-muted-foreground hover:text-foreground focus-visible:outline-none"
  >
    <Icon name="bookmark" size={18} />
  </a>
{/if}
