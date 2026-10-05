<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Lists the tags the signed-in user follows, with an unfollow action per row.
     Following a tag happens from its tag page; this is the management surface. -->
<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { TagWithCount } from "#lib/types.js";

  // `initial` is the server-loaded list; without it the browser loads it.
  let { initial = null }: { initial?: TagWithCount[] | null } = $props();
  const seed = untrack(() => initial);

  const api = endpoints();

  let tags = $state<TagWithCount[]>(seed ?? []);
  let loaded = $state(!!seed);
  let loading = $state(!seed);
  let busy = $state<string | null>(null); // slug whose unfollow is in flight
  let error = $state("");

  async function load() {
    loading = true;
    error = "";
    try {
      const res = await api.followedTags();
      tags = res.tags;
      loaded = true;
    } catch (e) {
      error = e instanceof ApiError ? e.message : "Couldn't load the tags you follow.";
    } finally {
      loading = false;
    }
  }

  async function unfollow(slug: string) {
    busy = slug;
    error = "";
    try {
      await api.unfollowTag(slug);
      tags = tags.filter((t) => t.slug !== slug);
    } catch (e) {
      error = e instanceof ApiError ? e.message : `Couldn't unfollow #${slug}.`;
    } finally {
      busy = null;
    }
  }

  // Browser-only: the API client uses relative URLs, which SvelteKit forbids
  // during SSR.
  onMount(() => {
    if (!seed) load();
  });
</script>

{#if loading && !loaded}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else if !loaded}
  <div class="flex flex-col items-center gap-3 py-6 text-center text-sm">
    <p class="text-destructive">{error}</p>
    <Button variant="outline" size="sm" onclick={load}>Try again</Button>
  </div>
{:else if tags.length === 0}
  <p class="py-6 text-center text-sm text-muted-foreground">You don't follow any tags yet. Open a tag to follow it.</p>
{:else}
  <ul class="divide-y divide-border">
    {#each tags as tag (tag.slug)}
      <li class="flex items-center justify-between gap-3 py-3">
        <a href={`/tags/${tag.slug}`} class="flex min-w-0 items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-alt">
            <Icon name="tag" size={18} />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-foreground">#{tag.name}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {tag.postCount}
              {tag.postCount === 1 ? "article" : "articles"}
            </span>
          </span>
        </a>
        <Button variant="outline" size="sm" disabled={busy === tag.slug} onclick={() => unfollow(tag.slug)}>
          {busy === tag.slug ? "…" : "Unfollow"}
        </Button>
      </li>
    {/each}
  </ul>
{/if}
{#if loaded && error}
  <p class="mt-3 text-sm text-destructive">{error}</p>
{/if}
