<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Checkbox, Label } from "bits-ui";
  import { ApiError, endpoints } from "#lib/api/index.js";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import type { ContentImportPreview, ContentImportResult } from "#lib/types.js";

  let file = $state<File | null>(null);
  let preview = $state<ContentImportPreview | null>(null);
  let result = $state<ContentImportResult | null>(null);
  let preservePublished = $state(false);
  let busy = $state(false);
  let exporting = $state(false);
  let error = $state("");
  const newCount = $derived(preview?.items.filter((item) => !item.duplicate).length ?? 0);

  function chooseFile(event: Event) {
    file = (event.target as HTMLInputElement).files?.[0] ?? null;
    preview = null;
    result = null;
    preservePublished = false;
    error = "";
    if (file && file.size > 50 * 1024 * 1024) {
      file = null;
      error = "Choose an archive up to 50 MB.";
    }
  }

  async function inspect() {
    if (!file || busy) return;
    busy = true;
    error = "";
    result = null;
    preview = null;
    try {
      preview = await endpoints().previewContent(file);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "The archive could not be previewed.";
    } finally {
      busy = false;
    }
  }

  async function restore() {
    if (!file || !preview || busy) return;
    busy = true;
    error = "";
    try {
      result = await endpoints().importContent(file, preservePublished);
      preview = null;
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : "The import could not be completed. Preview and retry; duplicates will be skipped.";
      preview = null;
    } finally {
      busy = false;
    }
  }

  async function download() {
    exporting = true;
    error = "";
    try {
      const blob = await endpoints().exportContent();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "omicron-content.zip";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Your content could not be exported.";
    } finally {
      exporting = false;
    }
  }
</script>

<div class="flex flex-col gap-8">
  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Export your content</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Download your posts and drafts, including dates, tags, cover credits, and uploaded images. The ZIP contains an
      Omicron backup, standalone HTML, and a WordPress WXR export. External images remain linked and are not backed up.
    </p>
    <p class="mt-2 text-sm text-muted-foreground">
      This archive includes private drafts. Store it securely. Up to 1,000 posts and 50 MB compressed (100 MB expanded).
    </p>
    <Button class="mt-4" variant="outline" disabled={exporting || busy} onclick={download}>
      {exporting ? "Exporting…" : "Download content"}
    </Button>
    <div class="mt-4 text-sm text-muted-foreground">
      <h3 class="font-medium text-foreground">Moving to Medium, Substack, or another platform</h3>
      <p class="mt-2">
        Medium imports individual published article URLs. Substack imports supported website or RSS feed URLs. Neither
        is guaranteed to accept this ZIP directly. Use the destination's importer while your original site is online, or
        copy the exported HTML. WordPress accepts the included wordpress.xml file; keep the source online while it
        copies images. Comments, followers, subscribers, and payments are not transferred.
      </p>
    </div>
  </section>

  <section class="rounded-card border border-border bg-background p-6">
    <h2 class="text-lg font-semibold tracking-tight text-foreground">Import content</h2>
    <p class="mt-1 text-sm text-muted-foreground">
      Choose an Omicron, Medium, or Substack export ZIP, a WordPress WXR file, or an RSS XML file. Preview before
      importing. Existing posts are never overwritten, and repeat imports skip duplicates.
    </p>
    <p class="mt-2 text-sm text-muted-foreground">
      Imports are drafts by default. Scheduled content and content marked private or paywalled always stay drafts.
      Medium posts always become drafts because their exports do not reliably identify paywalls. Images bundled in the
      archive are uploaded here; external images remain linked.
    </p>
    <div class="mt-4 flex flex-col items-start gap-3">
      <Label.Root
        for="content-archive"
        class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >Export file</Label.Root
      >
      <input
        id="content-archive"
        type="file"
        accept=".zip,.xml,application/zip,application/xml,text/xml"
        disabled={busy || exporting}
        onchange={chooseFile}
        class="w-full rounded-input border border-input bg-background p-3 text-sm text-foreground"
      />
      <Button variant="outline" disabled={!file || busy || exporting} onclick={inspect}>
        {busy ? "Processing…" : "Preview import"}
      </Button>
    </div>

    {#if preview}
      <div class="mt-5 space-y-4">
        <p class="text-sm font-medium text-foreground">
          {preview.format} export: {newCount} new posts, {preview.items.length - newCount} duplicates, {preview.imageCount}
          bundled images.
        </p>
        {#each preview.warnings as warning (warning)}
          <p class="text-sm text-muted-foreground">{warning}</p>
        {/each}
        <ul
          class="max-h-80 space-y-3 overflow-y-auto rounded-input border border-border p-3"
          aria-label="Import preview"
        >
          {#each preview.items as item (item.key)}
            <li class="text-sm text-foreground">
              <span class="font-medium">{item.title}</span>
              <span class="text-muted-foreground">
                — {item.status}, {item.createdAt.slice(0, 10)}{item.duplicate
                  ? " · Already imported; skipped"
                  : ""}</span
              >
              {#each item.warnings as warning (warning)}<p class="text-xs text-muted-foreground">{warning}</p>{/each}
            </li>
          {/each}
        </ul>
        <div class="flex items-center space-x-3">
          <Checkbox.Root
            id="preserve-published"
            aria-labelledby="preserve-published-label"
            bind:checked={preservePublished}
            disabled={busy}
            class="peer inline-flex size-[25px] items-center justify-center rounded-md border border-muted bg-foreground transition-all duration-150 ease-in-out active:scale-[0.98] data-[state=unchecked]:border-border-input data-[state=unchecked]:bg-background data-[state=unchecked]:hover:border-dark-40"
          >
            {#snippet children({ checked })}<div class="inline-flex items-center justify-center text-background">
                {#if checked}<Icon name="check" size={15} />{/if}
              </div>{/snippet}
          </Checkbox.Root>
          <Label.Root
            id="preserve-published-label"
            for="preserve-published"
            class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >Keep previously public posts published</Label.Root
          >
        </div>
        {#if preservePublished}<p class="text-sm text-muted-foreground">
            Previously public posts will go live immediately and may be delivered to followers. Review the preview
            before continuing.
          </p>{/if}
        <Button variant="solid" disabled={busy || newCount === 0} onclick={restore}>Import {newCount} posts</Button>
      </div>
    {/if}

    {#if result}
      <div class="mt-4 text-sm text-foreground" role="status">
        <p>{result.imported} imported, {result.skipped} skipped, {result.failed.length} failed.</p>
        {#each result.failed as failure, index (index)}<p class="mt-2 text-destructive">
            {failure.title}: {failure.error}
          </p>{/each}
        {#if result.failed.length}<p class="mt-2 text-muted-foreground">
            Preview and retry the same file. Posts already imported will be skipped.
          </p>{/if}
        <a href="/posts/manage" class="mt-2 inline-block underline underline-offset-4">Manage your posts</a>
      </div>
    {/if}
  </section>
  {#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
</div>
