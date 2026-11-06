<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { page } from "$app/state";
  import logo from "#lib/assets/omicron.svg";
  import { imageUrl } from "#lib/imageProxy.js";
  import type { InstanceInfo } from "#lib/types.js";

  // The admin's logo, else the built-in one. Decorative: the instance's name always sits beside or below it.
  let { class: className = "", width, height }: { class?: string; width?: number; height?: number } = $props();

  const custom = $derived((page.data.instance as InstanceInfo | null | undefined)?.logoUrl);
</script>

<img src={custom ? imageUrl(custom) : logo} alt="" {width} {height} class={className} />
