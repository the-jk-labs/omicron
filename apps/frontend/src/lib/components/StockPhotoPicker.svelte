<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { PhotoProvider, StockPhoto } from "$lib/types";
  import { Dialog, Tabs } from "bits-ui";

  // Search for a free, properly-licensed banner photo.
  //
  // Openverse needs no credentials, so this is always available. Unsplash is
  // offered as a second tab only when an operator has configured a key — the
  // provider list comes from the server, so the tab bar is simply absent when
  // there is nothing to switch between.
  let {
    open = $bindable(false),
    onPick,
  }: {
    open?: boolean;
    onPick: (photo: StockPhoto) => void;
  } = $props();

  const LABELS: Record<PhotoProvider, string> = {
    openverse: "Openverse",
    unsplash: "Unsplash",
  };

  let providers = $state<PhotoProvider[]>(["openverse"]);
  let provider = $state<PhotoProvider>("openverse");
  let query = $state("");
  let photos = $state<StockPhoto[]>([]);
  let searching = $state(false);
  let error = $state("");
  // Distinguishes "nothing found" from "nothing searched for yet", so the empty
  // grid says the right thing.
  let searched = $state(false);

  $effect(() => {
    endpoints()
      .photoProviders()
      .then((r) => {
        if (r.providers.length) providers = r.providers;
        return undefined;
      })
      .catch(() => {});
  });

  async function run(p: PhotoProvider, q: string) {
    if (!q || searching) return;
    searching = true;
    error = "";
    try {
      photos = (await endpoints().searchPhotos(p, q)).items;
      searched = true;
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Photo search failed.";
      photos = [];
    } finally {
      searching = false;
    }
  }

  function search(e?: SubmitEvent) {
    e?.preventDefault();
    void run(provider, query.trim());
  }

  // Switching tabs re-runs the current search against the other provider, which
  // is what "the same thing, from somewhere else" should do — retyping the
  // query to compare sources would be busywork.
  function switchTo(next: string | undefined) {
    if (!next || next === provider) return;
    provider = next as PhotoProvider;
    photos = [];
    searched = false;
    error = "";
    void run(provider, query.trim());
  }

  // Choosing a photo is what a provider counts as using it, so the usage ping
  // goes out here. Deliberately not awaited: the author's choice is theirs
  // whether or not a third-party counter answers.
  function pick(photo: StockPhoto) {
    if (photo.useToken) {
      endpoints()
        .recordPhotoUse(provider, photo.useToken)
        .catch(() => {});
    }
    onPick(photo);
    open = false;
  }

  // Each open starts clean rather than showing the last search's results, which
  // would look like a response to a query the author hasn't typed yet.
  function onOpenChange(next: boolean) {
    open = next;
    if (next) return;
    query = "";
    photos = [];
    error = "";
    searched = false;
  }
</script>

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 flex-col rounded-card border border-border bg-background shadow-popover sm:max-w-[720px]"
    >
      <div class="flex items-center justify-between border-b border-border px-5 py-4">
        <Dialog.Title class="text-base font-semibold tracking-tight text-foreground">Choose a photo</Dialog.Title>
        <Dialog.Close
          class="text-muted-foreground hover:text-foreground focus-visible:outline-hidden"
          aria-label="Close"
        >
          <Icon name="close" size={18} />
        </Dialog.Close>
      </div>

      <Dialog.Description class="sr-only">
        Search for a free, openly-licensed photo to use as this post's banner.
      </Dialog.Description>

      <div class="flex flex-col gap-3 border-b border-border px-5 py-4">
        {#if providers.length > 1}
          <Tabs.Root value={provider} onValueChange={switchTo}>
            <Tabs.List
              class="inline-flex items-center gap-1 rounded-input border border-input bg-background-alt p-1 shadow-btn"
            >
              {#each providers as p (p)}
                <Tabs.Trigger
                  value={p}
                  class="inline-flex h-8 items-center rounded-button px-3 text-sm font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-mini"
                >
                  {LABELS[p]}
                </Tabs.Trigger>
              {/each}
            </Tabs.List>
          </Tabs.Root>
        {/if}

        <form onsubmit={search} class="flex items-center gap-2">
          <input
            bind:value={query}
            placeholder="Search free photos — mountains, desk, coffee…"
            aria-label="Search photos"
            class="h-10 min-w-0 flex-1 rounded-input border border-input bg-background px-3.5 text-sm shadow-btn outline-hidden transition-colors placeholder:text-muted-foreground focus:border-foreground"
          />
          <Button type="submit" variant="solid" size="sm" disabled={searching || !query.trim()}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {#if error}
          <p class="text-sm text-destructive">{error}</p>
        {:else if searching}
          <p class="text-sm text-muted-foreground">Searching…</p>
        {:else if photos.length}
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {#each photos as photo (photo.id)}
              <figure class="flex flex-col gap-1">
                <button
                  type="button"
                  onclick={() => pick(photo)}
                  class="group aspect-4/3 overflow-hidden rounded-card border border-border focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-hidden"
                >
                  <img
                    src={photo.thumbUrl}
                    alt={photo.alt || "Photo"}
                    loading="lazy"
                    decoding="async"
                    class="h-full w-full object-cover transition-opacity group-hover:opacity-80"
                  />
                </button>
                <!-- These photos are licensed on condition of attribution, so
                     the creator is named in the grid too, not only once one is
                     chosen. -->
                <figcaption class="truncate text-xs text-muted-foreground">
                  <a
                    href={photo.credit.nameUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    class="hover:text-foreground hover:underline"
                  >
                    {photo.credit.name}
                  </a>
                  {#if photo.credit.license}
                    <span class="text-muted-foreground/70">· {photo.credit.license}</span>
                  {/if}
                </figcaption>
              </figure>
            {/each}
          </div>
        {:else if searched}
          <p class="text-sm text-muted-foreground">No photos matched that search.</p>
        {:else}
          <p class="text-sm text-muted-foreground">
            Search for a photo you're free to publish. The creator and licence are credited under your banner
            automatically.
          </p>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
