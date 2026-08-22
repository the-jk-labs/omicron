<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import type { IconName } from "$lib/components/Icon.svelte";
  import { countLabel } from "$lib/format";

  let {
    icon,
    count,
    singular,
    plural,
    size = 13,
  }: {
    icon: IconName;
    count: number;
    singular: string;
    plural?: string;
    size?: number;
  } = $props();
</script>

<span class="flex items-center gap-1" title={countLabel(count, singular, plural)}>
  <span aria-hidden="true" class="flex items-center gap-1">
    <Icon name={icon} {size} />
    {count}
  </span>
  <span class="sr-only">{countLabel(count, singular, plural)}</span>
</span>
