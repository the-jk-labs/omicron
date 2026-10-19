<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { beforeNavigate, goto } from "$app/navigation";
  import type { Content } from "@tiptap/core";
  import { Label, Switch } from "bits-ui";
  import { onMount, untrack } from "svelte";
  import { endpoints, ApiError } from "#lib/api/index.js";
  import BannerPicker from "#lib/components/BannerPicker.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import LanguageSelect from "#lib/components/LanguageSelect.svelte";
  import PageTitle from "#lib/components/PageTitle.svelte";
  import SummaryField from "#lib/components/SummaryField.svelte";
  import TagInput from "#lib/components/TagInput.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { confirm } from "#lib/components/ui/confirm.js";
  import Editor from "#lib/editor/Editor.svelte";
  import { postPath } from "#lib/links.js";
  import type { CoverCredit } from "#lib/types.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  // Seed the editor once from the loaded post; later edits live in the editor.
  const post = untrack(() => data.post);

  let title = $state(post.title ?? "");
  let tags = $state<string[]>(post.tags?.map((t) => t.name) ?? []);
  let aiAssisted = $state(post.aiAssisted ?? false);
  let language = $state<string | null>(post.language ?? null);
  // Seeded from the stored value, and always sent back — omitting the field
  // would leave it untouched, but an author who cleared it here must have the
  // clearing saved, and one who never touches it must not lose what they wrote.
  let summary = $state(post.summary ?? "");
  // Seeded from the *chosen* banner, never the resolved one — a post that has
  // been showing its first body image must not have that turned into an
  // explicit choice just because someone opened the editor.
  let coverUrl = $state<string | null>(post.coverUrl ?? null);
  let coverCredit = $state<CoverCredit | null>(post.coverCredit ?? null);
  let html = $state(post.contentHtml);
  let json = $state<unknown>(post.contentJson ?? null);
  let error = $state("");
  let busy = $state(false);

  function onUpdate(h: string, j: unknown) {
    html = h;
    json = j;
  }

  // Nothing autosaves here (a save federates an Update), so leaving with changes
  // asks first: in-app navigation through a confirm, closing the tab through the
  // browser. `leaving` lets our own post-save navigation through.
  let leaving = false;
  const snapshot = () => JSON.stringify({ title, tags, language, summary, coverUrl, coverCredit, html, aiAssisted });
  const initial = untrack(snapshot);
  const dirty = $derived(snapshot() !== initial);

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (dirty && !leaving) {
      e.preventDefault();
      e.returnValue = "";
    }
  }
  onMount(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  beforeNavigate(async (nav) => {
    if (leaving || nav.willUnload || !dirty) return;
    nav.cancel();
    const target = nav.to?.url;
    const { ok } = await confirm({
      title: "Discard your changes?",
      description: "Your edits to this post haven't been saved. Leaving now loses them.",
      confirmText: "Discard",
      cancelText: "Keep editing",
      destructive: true,
    });
    if (!ok || !target) return;
    leaving = true;
    goto(target);
  });

  async function save() {
    if (!title.trim()) {
      error = "A blog post must have a title.";
      return;
    }
    if (!html.trim() || html === "<p></p>") {
      error = "Write something first.";
      return;
    }
    error = "";
    busy = true;
    try {
      const { post: saved } = await endpoints().updatePost(post.id, {
        title: title.trim(),
        contentHtml: html,
        contentJson: json,
        aiAssisted,
        language,
        summary: summary.trim() || null,
        coverUrl,
        coverCredit,
        tags,
      });
      // A retitle moves the post to a new slug, so navigate to the one the
      // save came back with rather than to the address it had on open.
      leaving = true;
      goto(postPath({ ...post, slug: saved.slug }));
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Failed to save.";
      busy = false;
    }
  }
</script>

<PageTitle text="Edit" />

<div class="mb-8 flex items-center justify-between">
  <p class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
    <Icon name="edit" size={16} /> Editing
  </p>
  <div class="flex items-center gap-2">
    <Button href={postPath(post)} variant="ghost">Cancel</Button>
    <Button onclick={save} disabled={busy} variant="solid">
      {busy ? "Saving…" : "Save"}
    </Button>
  </div>
</div>

<input
  placeholder="Title"
  bind:value={title}
  class="mb-6 w-full border-none bg-transparent text-3xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-hidden sm:text-4xl"
/>

<SummaryField bind:summary />

<div class="mb-6 flex items-center gap-3">
  <Switch.Root
    id="ai-assisted"
    checked={aiAssisted}
    onCheckedChange={(checked) => (aiAssisted = checked)}
    class="peer inline-flex h-[30px] min-h-[30px] w-[50px] shrink-0 cursor-pointer items-center rounded-full px-[3px] transition-colors focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden data-[state=checked]:bg-foreground data-[state=unchecked]:bg-dark-10 data-[state=unchecked]:shadow-mini-inset"
  >
    <Switch.Thumb
      class="pointer-events-none block size-6 shrink-0 rounded-full bg-background transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 data-[state=unchecked]:shadow-mini"
    />
  </Switch.Root>
  <div class="min-w-0">
    <Label.Root for="ai-assisted" class="text-sm font-medium text-foreground">AI assistance used</Label.Root>
    <p class="text-xs text-muted-foreground">I used AI to help write this post.</p>
  </div>
</div>

<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    <TagInput bind:tags />
  </div>
  <LanguageSelect bind:value={language} />
</div>

<BannerPicker bind:coverUrl bind:coverCredit contentHtml={html} />

<Editor {onUpdate} content={(post.contentJson as Content) ?? post.contentHtml} previewHtml={post.contentHtml} />

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}
