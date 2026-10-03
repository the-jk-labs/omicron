<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "Show more" under a paged list. A failed page says so (the list stays as it
     was) instead of only flipping the button back. -->
<script lang="ts">
  import Button from "#lib/components/ui/Button.svelte";

  let {
    load,
    loading,
    label = "Show more",
    size = "default",
    class: className = "mt-8",
  }: {
    load: () => Promise<unknown>;
    loading: boolean;
    label?: string;
    size?: "default" | "sm";
    class?: string;
  } = $props();

  let failed = $state(false);

  async function click() {
    failed = false;
    try {
      await load();
    } catch {
      failed = true;
    }
  }
</script>

<div class="flex flex-col items-center gap-2 {className}">
  <Button onclick={click} disabled={loading} variant="outline" {size}>
    {loading ? "Loading…" : label}
  </Button>
  {#if failed}
    <p role="alert" class="text-sm text-destructive">Couldn't load more. Try again.</p>
  {/if}
</div>
