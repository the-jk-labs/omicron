<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import ProfileLinkIcon from "$lib/components/ProfileLinkIcon.svelte";
  import { linkSubtitle, platformMeta } from "$lib/profileLinks";
  import type { ProfileLink } from "$lib/types";

  // The external links a user features on their profile, shown as a card of
  // clickable rows above the About details. Each row opens in a new tab.
  let { links }: { links: ProfileLink[] } = $props();
</script>

<ul class="divide-y divide-border overflow-hidden rounded-card border border-border bg-background-alt">
  {#each links as link (link.platform + link.url)}
    {@const meta = platformMeta(link.platform)}
    <li>
      <a
        href={link.url}
        target="_blank"
        rel="me noopener noreferrer"
        class="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-hidden"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <span class="shrink-0 text-muted-foreground group-hover:text-foreground">
            <ProfileLinkIcon platform={link.platform} size={18} />
          </span>
          <span class="truncate text-sm font-medium text-foreground">
            {link.label || meta.label}
          </span>
        </span>
        <span class="min-w-0 truncate text-sm text-muted-foreground">{linkSubtitle(link.platform, link.url)}</span>
      </a>
    </li>
  {/each}
</ul>
