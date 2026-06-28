<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import ProfileLinkIcon from "$lib/components/ProfileLinkIcon.svelte";
  import { linkSubtitle, platformMeta } from "$lib/profileLinks";
  import type { ProfileLink } from "$lib/types";

  // The external links a user features on their profile, shown as a card of
  // clickable rows above the About details. Each row opens in a new tab.
  let { links }: { links: ProfileLink[] } = $props();
</script>

<ul class="divide-border bg-background-alt rounded-card border-border divide-y overflow-hidden rounded-card border">
  {#each links as link (link.platform + link.url)}
    {@const meta = platformMeta(link.platform)}
    <li>
      <a
        href={link.url}
        target="_blank"
        rel="me noopener noreferrer"
        class="hover:bg-muted flex items-center justify-between gap-3 px-4 py-3 transition-colors focus-visible:outline-none"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          <span class="text-muted-foreground group-hover:text-foreground shrink-0">
            <ProfileLinkIcon platform={link.platform} size={18} />
          </span>
          <span class="text-foreground truncate text-sm font-medium">
            {link.label || meta.label}
          </span>
        </span>
        <span class="text-muted-foreground min-w-0 truncate text-sm">{linkSubtitle(link.platform, link.url)}</span>
      </a>
    </li>
  {/each}
</ul>
