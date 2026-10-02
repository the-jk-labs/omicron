<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Stands in for AvatarCropper (canvas-based, not drawable in jsdom): "Apply crop" hands back a fixed square PNG. -->
<script lang="ts">
  let {
    open = $bindable(false),
    src,
    onCrop,
  }: { open?: boolean; src: string | null; onCrop: (file: File) => void } = $props();
</script>

{#if open && src}
  <button
    type="button"
    onclick={() => {
      onCrop(new File([new Uint8Array(64)], "avatar.png", { type: "image/png" }));
      open = false;
    }}>Apply crop</button
  >
{/if}
