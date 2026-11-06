<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { refreshAll } from "$app/navigation";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { isAcceptedImage, prepareImage } from "#lib/editor/image.js";
  import { imageUrl } from "#lib/imageProxy.js";

  const MAX_DIMENSION = { logo: 512, favicon: 256 };

  let {
    kind,
    label,
    hint,
    url = $bindable(),
  }: { kind: "logo" | "favicon"; label: string; hint: string; url?: string | null } = $props();

  let input = $state<HTMLInputElement | null>(null);
  let busy = $state(false);
  let error = $state("");

  // Saves straight away, like the banner, and leaves the rest of the form's unsaved edits alone.
  async function change(work: () => Promise<{ logoUrl: string | null; faviconUrl: string | null }>) {
    busy = true;
    error = "";
    try {
      const saved = await work();
      url = kind === "logo" ? saved.logoUrl : saved.faviconUrl;
      await refreshAll();
    } catch (e) {
      error = e instanceof ApiError ? e.message : `Failed to update the ${kind}.`;
    } finally {
      busy = false;
    }
  }

  async function onFile(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    target.value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      error = "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
      return;
    }
    await change(async () => {
      const { blob, type } = await prepareImage(file, MAX_DIMENSION[kind]);
      return endpoints().uploadBrandImage(kind, blob, type);
    });
  }
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-center gap-3">
    <div
      class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border bg-background text-muted-foreground"
    >
      {#if url}
        <img src={imageUrl(url)} alt="" class="h-full w-full object-contain" />
      {:else}
        <Icon name="image" size={18} />
      {/if}
    </div>
    <div class="flex min-w-0 flex-col gap-1.5">
      <span class="text-sm font-medium text-foreground">{label}</span>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`Upload ${kind}`}
          disabled={busy}
          onclick={() => input?.click()}
        >
          <Icon name="image" size={15} />
          {busy ? "Saving…" : "Upload"}
        </Button>
        {#if url}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Reset ${kind} to default`}
            disabled={busy}
            onclick={() => change(() => endpoints().removeBrandImage(kind))}
          >
            <Icon name="close" size={15} /> Reset to default
          </Button>
        {/if}
      </div>
      <p class="text-xs text-muted-foreground">{hint}</p>
    </div>
  </div>
  {#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
  <input
    bind:this={input}
    type="file"
    hidden
    aria-label={`Choose ${kind} file`}
    accept="image/png,image/jpeg,image/webp,image/gif"
    onchange={onFile}
    class="hidden"
  />
</div>
