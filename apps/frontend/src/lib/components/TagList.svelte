<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Read-only row of tag pills linking to each tag's page. Reused on post
     cards, the article page and tag pages. -->
<script lang="ts">
  import type { Tag } from "$lib/types";

  let { tags, class: className = "" }: { tags: Tag[]; class?: string } = $props();
</script>

{#if tags.length}
  <ul class="flex flex-wrap items-center gap-2 {className}">
    {#each tags as tag (tag.slug)}
      <li>
        <a
          href={`/tags/${tag.slug}`}
          class="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground-alt transition-colors hover:bg-dark-10 hover:text-foreground"
        >
          #{tag.name}
        </a>
      </li>
    {/each}
  </ul>
{/if}
