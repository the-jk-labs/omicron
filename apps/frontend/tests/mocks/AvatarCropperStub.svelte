<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Stands in for AvatarCropper (canvas-based, not drawable in jsdom): "Save crop" hands back a fixed square PNG,
     waits for the save, and keeps the dialog open with the message if it fails. -->
<script lang="ts">
  let {
    open = $bindable(false),
    src,
    onCrop,
  }: { open?: boolean; src: string | null; onCrop: (file: File) => void | Promise<void> } = $props();
  let error = $state("");
</script>

{#if open && src}
  <button
    type="button"
    onclick={async () => {
      try {
        await onCrop(new File([new Uint8Array(64)], "avatar.png", { type: "image/png" }));
        open = false;
      } catch (err) {
        error = (err as Error).message;
      }
    }}>Save crop</button
  >
  {#if error}<p>{error}</p>{/if}
{/if}
