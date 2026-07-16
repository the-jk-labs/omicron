<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Dialog, Slider } from "bits-ui";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";

  // Instagram-style avatar cropper. Given a picked image (`src` object URL), the
  // user pans (drag) and zooms (slider) inside a circular viewport; confirming
  // renders the visible square region to a WebP File the caller then uploads.
  //
  // The crop is square (avatars render as circles everywhere via object-cover),
  // which also fixes non-square photos being squished into the avatar frame.
  let {
    open = $bindable(false),
    src,
    onCrop,
  }: {
    open?: boolean;
    src: string | null;
    onCrop: (file: File) => void;
  } = $props();

  // CSS size of the square editing viewport, and the size of the exported image.
  // 512px is comfortably above the ~160px avatars ever render at, so the upload
  // pipeline (prepareImage) downscales rather than upscales.
  const VIEWPORT = 280;
  const OUTPUT = 512;

  let img = $state<HTMLImageElement | null>(null);
  let natural = $state({ w: 0, h: 0 });
  // Slider zoom multiplier over the base "cover" scale.
  let zoom = $state(1);
  // Top-left of the image relative to the viewport top-left, in CSS px.
  let offset = $state({ x: 0, y: 0 });
  let busy = $state(false);

  // Scale at which the image exactly covers the viewport (zoom = 1).
  const coverScale = $derived(
    natural.w && natural.h ? VIEWPORT / Math.min(natural.w, natural.h) : 1,
  );
  const scale = $derived(coverScale * zoom);
  const displayW = $derived(natural.w * scale);
  const displayH = $derived(natural.h * scale);

  // Keep the image covering the viewport on every zoom/pan change.
  function clamp(x: number, y: number) {
    const minX = VIEWPORT - displayW;
    const minY = VIEWPORT - displayH;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
  }

  function onImageLoad(e: Event) {
    const el = e.currentTarget as HTMLImageElement;
    img = el;
    natural = { w: el.naturalWidth, h: el.naturalHeight };
    zoom = 1;
    // Center the image in the viewport at the base "cover" scale.
    const cs = VIEWPORT / Math.min(el.naturalWidth, el.naturalHeight);
    offset = { x: (VIEWPORT - el.naturalWidth * cs) / 2, y: (VIEWPORT - el.naturalHeight * cs) / 2 };
  }

  // Re-clamp (and thus re-center toward bounds) whenever the zoom changes.
  $effect(() => {
    void zoom;
    offset = clamp(offset.x, offset.y);
  });

  // ── drag to pan ──
  let dragging = false;
  let last = { x: 0, y: 0 };
  function onPointerDown(e: PointerEvent) {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    offset = clamp(offset.x + (e.clientX - last.x), offset.y + (e.clientY - last.y));
    last = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  async function confirm() {
    if (!img) return;
    busy = true;
    try {
      // Map the viewport square back to source-image pixels.
      const srcSize = VIEWPORT / scale;
      const srcX = -offset.x / scale;
      const srcY = -offset.y / scale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9),
      );
      if (!blob) return;
      onCrop(new File([blob], "avatar.webp", { type: "image/webp" }));
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[360px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">
        Adjust photo
      </Dialog.Title>
      <Dialog.Description class="text-foreground-alt mt-1.5 text-sm">
        Drag to reposition and zoom to frame your picture.
      </Dialog.Description>

      <div class="mt-5 flex flex-col items-center gap-5">
        <!-- Square editing surface with a circular avatar mask overlay. -->
        <div
          role="slider"
          aria-label="Reposition photo"
          tabindex="0"
          aria-valuenow={Math.round(offset.x)}
          class="relative cursor-grab overflow-hidden rounded-card bg-dark touch-none select-none active:cursor-grabbing"
          style={`width:${VIEWPORT}px;height:${VIEWPORT}px`}
          onpointerdown={onPointerDown}
          onpointermove={onPointerMove}
          onpointerup={onPointerUp}
          onpointercancel={onPointerUp}
        >
          {#if src}
            <img
              {src}
              alt=""
              draggable="false"
              onload={onImageLoad}
              class="pointer-events-none absolute max-w-none origin-top-left"
              style={`left:0;top:0;width:${displayW}px;height:${displayH}px;transform:translate(${offset.x}px,${offset.y}px)`}
            />
          {/if}
          <!-- Circular cutout: dims everything outside the avatar circle. -->
          <div
            class="pointer-events-none absolute inset-0"
            style="box-shadow:0 0 0 9999px rgba(0,0,0,0.5) inset;border-radius:50%"
          ></div>
        </div>

        <div class="flex w-full items-center gap-3">
          <Icon name="minus" size={16} class="text-muted-foreground shrink-0" />
          <Slider.Root
            type="single"
            bind:value={zoom}
            min={1}
            max={3}
            step={0.01}
            class="relative flex w-full touch-none select-none items-center"
          >
            <span class="bg-dark-10 relative h-2 w-full grow cursor-pointer overflow-hidden rounded-full">
              <Slider.Range class="bg-foreground absolute h-full" />
            </span>
            <Slider.Thumb
              index={0}
              class="border-border-input bg-background focus-visible:ring-foreground block size-5 cursor-pointer rounded-full border shadow-mini transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
            />
          </Slider.Root>
          <Icon name="plus" size={16} class="text-muted-foreground shrink-0" />
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-2">
        <Dialog.Close
          class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
        >
          Cancel
        </Dialog.Close>
        <Button variant="solid" class="h-10 px-5 text-sm" disabled={busy} onclick={confirm}>
          {busy ? "Saving…" : "Apply"}
        </Button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
