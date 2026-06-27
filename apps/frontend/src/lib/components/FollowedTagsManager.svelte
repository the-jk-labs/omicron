<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Lists the tags the signed-in user follows, with an unfollow action per row.
     Following a tag happens from its tag page; this is the management surface. -->
<script lang="ts">
  import { endpoints } from "$lib/api";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { TagWithCount } from "$lib/types";

  const api = endpoints();

  let tags = $state<TagWithCount[]>([]);
  let loaded = $state(false);
  let loading = $state(true);
  let busy = $state<string | null>(null); // slug whose unfollow is in flight

  async function load() {
    loading = true;
    try {
      const res = await api.followedTags();
      tags = res.tags;
      loaded = true;
    } finally {
      loading = false;
    }
  }

  async function unfollow(slug: string) {
    busy = slug;
    try {
      await api.unfollowTag(slug);
      tags = tags.filter((t) => t.slug !== slug);
    } finally {
      busy = null;
    }
  }

  load();
</script>

{#if loading && !loaded}
  <p class="py-6 text-center text-sm text-muted-foreground">Loading…</p>
{:else if tags.length === 0}
  <p class="py-6 text-center text-sm text-muted-foreground">
    You don't follow any tags yet. Open a tag to follow it.
  </p>
{:else}
  <ul class="divide-y divide-border">
    {#each tags as tag (tag.slug)}
      <li class="flex items-center justify-between gap-3 py-3">
        <a href={`/tags/${tag.slug}`} class="flex min-w-0 items-center gap-3">
          <span
            class="bg-muted text-foreground-alt flex size-10 shrink-0 items-center justify-center rounded-full"
          >
            <Icon name="tag" size={18} />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-foreground">#{tag.name}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {tag.postCount}
              {tag.postCount === 1 ? "story" : "stories"}
            </span>
          </span>
        </a>
        <Button
          variant="outline"
          size="sm"
          disabled={busy === tag.slug}
          onclick={() => unfollow(tag.slug)}
        >
          {busy === tag.slug ? "…" : "Unfollow"}
        </Button>
      </li>
    {/each}
  </ul>
{/if}
