<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { platformMeta } from "$lib/profileLinks";

  // Renders a profile-link platform's glyph: an inlined Simple Icons brand path
  // for known platforms, or a Lucide icon for website/custom. Inherits colour
  // via `currentColor`.
  let { platform, size = 18, class: className = "" }: {
    platform: string;
    size?: number;
    class?: string;
  } = $props();

  const meta = $derived(platformMeta(platform));
</script>

{#if meta.brand}
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    class={className}
    aria-hidden="true"
  >
    <path d={meta.brand} />
  </svg>
{:else}
  <Icon name={meta.icon ?? "link"} {size} class={className} />
{/if}
