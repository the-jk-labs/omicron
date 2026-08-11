<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { endpoints, ApiError } from "$lib/api";
  import Icon from "$lib/components/Icon.svelte";
  import StockPhotoPicker from "$lib/components/StockPhotoPicker.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { firstBodyImage } from "$lib/cover";
  import { isAcceptedImage, prepareImage } from "$lib/editor/image";
  import type { CoverCredit, StockPhoto } from "$lib/types";

  // The post's banner: what a reader sees at the top of the article, what a
  // link preview (Open Graph) shows when the post is shared, and what a remote
  // instance renders in its card for it.
  //
  // Choosing one is optional. Left unset, the first image in the body stands in
  // — which is what most posts want and nobody should have to configure — so
  // this control shows that fallback as a live preview rather than an empty
  // box. `coverUrl` stays null in that case: only a deliberate choice is a
  // choice, and an author who later reorders their images should get the new
  // opening picture, not the one that happened to be first when they published.
  let {
    coverUrl = $bindable(null),
    coverCredit = $bindable(null),
    contentHtml = "",
    onChange,
  }: {
    coverUrl?: string | null;
    coverCredit?: CoverCredit | null;
    /** Live editor output, for the fallback preview. */
    contentHtml?: string;
    /** Called on any change, so the page can mark itself dirty. */
    onChange?: () => void;
  } = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let photosOpen = $state(false);
  let uploading = $state(false);
  let error = $state("");

  const fallback = $derived(coverUrl ? null : firstBodyImage(contentHtml));
  const preview = $derived(coverUrl ?? fallback);

  function set(url: string | null, credit: CoverCredit | null) {
    coverUrl = url;
    coverCredit = credit;
    onChange?.();
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    // Reset the input so re-picking the same file fires `change` again.
    (e.target as HTMLInputElement).value = "";
    if (!file) return;
    if (!isAcceptedImage(file)) {
      error = "Unsupported image type. Use PNG, JPEG, WebP, or GIF.";
      return;
    }
    error = "";
    uploading = true;
    try {
      const { blob, type } = await prepareImage(file);
      const { url } = await endpoints().uploadImage(blob, type);
      // An upload is the author's own image: nobody to credit, so any credit
      // left over from a previously chosen stock photo goes with it.
      set(url, null);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to upload the banner.";
    } finally {
      uploading = false;
    }
  }

  function onPhotoPick(photo: StockPhoto) {
    error = "";
    set(photo.bannerUrl, photo.credit);
  }
</script>

<div class="mb-6">
  <p class="mb-1.5 text-xs font-medium text-muted-foreground">
    Banner — shown at the top of the post and in link previews. Optional; the first image in your post is used when you
    don't pick one.
  </p>

  <div class="rounded-card border border-border bg-background-alt p-3">
    {#if preview}
      <div class="relative aspect-[16/9] max-h-64 w-full overflow-hidden rounded-card border border-border">
        <!-- Decorative here: this is a control, and the banner is labelled by
             the text above it. -->
        <img src={preview} alt="" class="h-full w-full object-cover" />
        {#if fallback}
          <span
            class="absolute bottom-2 left-2 rounded-button bg-dark/80 px-2 py-1 text-xs font-medium text-background"
          >
            From your post
          </span>
        {/if}
      </div>
    {:else}
      <div
        class="flex aspect-[16/9] max-h-64 w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border text-muted-foreground"
      >
        <Icon name="image" size={22} />
        <span class="text-sm">No banner yet</span>
      </div>
    {/if}

    {#if coverCredit}
      <p class="mt-2 text-xs text-muted-foreground">
        Photo by
        <a
          href={coverCredit.nameUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          class="underline hover:text-foreground"
        >
          {coverCredit.name}
        </a>
        on
        <a
          href={coverCredit.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          class="underline hover:text-foreground"
        >
          {coverCredit.source}
        </a>{#if coverCredit.license && coverCredit.licenseUrl}
          ·
          <a
            href={coverCredit.licenseUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="underline hover:text-foreground"
          >
            {coverCredit.license}
          </a>
        {/if}
      </p>
    {/if}

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onclick={() => fileInput?.click()} disabled={uploading}>
        <Icon name="image" size={15} />
        {uploading ? "Uploading…" : "Upload"}
      </Button>
      <Button variant="outline" size="sm" onclick={() => (photosOpen = true)} disabled={uploading}>
        <Icon name="search" size={15} /> Free photos
      </Button>
      {#if coverUrl}
        <!-- Removes the *choice*, not the banner: the body's first image takes
             over again, which the preview above updates to show. -->
        <Button variant="ghost" size="sm" onclick={() => set(null, null)} disabled={uploading}>
          <Icon name="close" size={15} /> Remove
        </Button>
      {/if}
    </div>

    {#if error}<p class="mt-2 text-sm text-destructive">{error}</p>{/if}
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    onchange={onFile}
    class="hidden"
  />
</div>

<StockPhotoPicker bind:open={photosOpen} onPick={onPhotoPick} />
