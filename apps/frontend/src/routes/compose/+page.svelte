<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import type { Content } from "@tiptap/core";
  import { beforeNavigate, goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import { confirm } from "$lib/components/ui/confirm";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import TagInput from "$lib/components/TagInput.svelte";
  import LanguageSelect from "$lib/components/LanguageSelect.svelte";
  import BannerPicker from "$lib/components/BannerPicker.svelte";
  import { reading } from "$lib/prefs.svelte";

  // Matches SUMMARY_LENGTH in the backend (lib/webhook.ts), which caps the
  // same column on the ingest path — so neither way of writing a post can
  // store a description the other would reject.
  const MAX_SUMMARY = 150;
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  // Seed the editor once from the loaded draft; later edits live in the editor.
  const draft = untrack(() => data.draft);

  // Lazy-load the Tiptap editor so it stays out of the initial bundle.
  type EditorComp = typeof import("$lib/editor/Editor.svelte").default;
  let EditorComponent = $state<EditorComp | null>(null);
  onMount(async () => {
    EditorComponent = (await import("$lib/editor/Editor.svelte")).default;
  });

  // When reopened from the Drafts list, `postId` is set so saving updates the
  // existing draft instead of creating a new one. It also gets set after the
  // first "Save draft" of a fresh post.
  let postId = $state<string | null>(draft?.id ?? null);
  let title = $state(draft?.title ?? "");
  let tags = $state<string[]>(draft?.tags?.map((t) => t.name) ?? []);
  // A reopened draft keeps whatever it was saved with — including a
  // deliberate blank. Only a genuinely new post takes the remembered default,
  // so revisiting a draft never silently relabels it.
  let language = $state<string | null>(draft ? draft.language ?? null : reading.composeLang);
  // The one-line description search engines print under the title, and link
  // previews show. Left empty it falls back to a truncation of the opening
  // paragraph — which is what every post used to get, often cut mid-clause.
  let summary = $state(draft?.summary ?? "");
  // The banner the author picked, if any. Null means "use the first image in
  // the post", which the picker previews and the server resolves on read — so
  // a draft saved without one is not silently committed to whatever image
  // happened to be first at the time.
  let coverUrl = $state<string | null>(draft?.coverUrl ?? null);
  let html = $state(draft?.contentHtml ?? "");
  let json = $state<unknown>(draft?.contentJson ?? null);
  let error = $state("");
  let busy = $state(false);
  let savingDraft = $state(false);

  // Set once the author edits the title, tags or body, so the unsaved-changes
  // guards only fire on real changes (not when simply opening/closing a draft).
  let touched = false;

  function onUpdate(h: string, j: unknown) {
    html = h;
    json = j;
    touched = true;
  }

  // The tag input mutates `tags` directly; mark touched when it diverges from
  // the draft's original tags.
  const initialTags = (draft?.tags?.map((t) => t.name) ?? []).join(",");
  // Must mirror `language`'s initial value, not the draft's — a new post now
  // starts at the remembered default, and comparing that against null would
  // mark the page dirty the instant it opened, so simply looking at the
  // composer and leaving would raise the unsaved-changes prompt.
  const initialLanguage = draft ? draft.language ?? null : reading.composeLang;
  const initialSummary = draft?.summary ?? "";
  $effect(() => {
    if (tags.join(",") !== initialTags || language !== initialLanguage) touched = true;
    if (summary !== initialSummary) touched = true;
  });

  // There's unsaved work worth keeping if the author has edited and there's
  // some content (an empty body is `<p></p>`).
  function hasContent(): boolean {
    if (!touched) return false;
    return (
      title.trim().length > 0 ||
      tags.length > 0 ||
      coverUrl !== null ||
      (html.trim().length > 0 && html !== "<p></p>")
    );
  }

  // `bypass` lets our own post-save navigations through the unsaved-changes guard.
  let bypass = false;

  // Creates or updates the post in the requested state, then leaves the editor.
  async function persist(status: "draft" | "published") {
    if (status === "published") {
      if (!title.trim()) {
        error = "A blog post must have a title.";
        return;
      }
      if (!html.trim() || html === "<p></p>") {
        error = "Write something first.";
        return;
      }
    } else if (!hasContent()) {
      error = "Nothing to save yet.";
      return;
    }
    error = "";
    bypass = true;
    if (status === "published") busy = true;
    else savingDraft = true;
    try {
      const body = {
        title: title.trim(),
        contentHtml: html,
        contentJson: json,
        status,
        language,
        // Null, not "", so the reader falls back to the derived excerpt
        // rather than showing an empty description.
        summary: summary.trim() || null,
        coverUrl,
        tags,
      };
      if (postId) {
        await endpoints().updatePost(postId, body);
      } else {
        const { post } = await endpoints().createPost(body);
        postId = post.id;
      }
      // Remember what they actually published in, so the next post starts
      // here instead of empty.
      if (status === "published") reading.setComposeLang(language);
      goto(status === "published" ? `/posts/${postId}` : "/drafts");
    } catch (err) {
      bypass = false;
      busy = false;
      savingDraft = false;
      error = err instanceof ApiError ? err.message : "Failed to save.";
    }
  }

  // Warn on full-page unload (closing/reloading the tab). Browsers only allow a
  // generic prompt here — the "save as draft" choice is offered on in-app
  // navigation below.
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (hasContent() && !bypass) {
      e.preventDefault();
      e.returnValue = "";
    }
  }
  onMount(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
  });
  onDestroy(() => window.removeEventListener("beforeunload", onBeforeUnload));

  // Leaving via an in-app link (a nav tab, etc.) with unsaved content: hold the
  // navigation and offer to save the work as a draft first.
  beforeNavigate(async (nav) => {
    if (bypass || nav.willUnload || !hasContent()) return;
    nav.cancel();
    const target = nav.to?.url;
    const save = await confirm({
      title: "Save as draft?",
      description: "You have unsaved changes. Save them as a draft before leaving?",
      confirmText: "Save draft",
      cancelText: "Discard",
    });
    if (save) {
      await persist("draft");
    } else {
      bypass = true;
      if (target) goto(target);
    }
  });
</script>

<PageTitle text="Write" />

<div class="mb-8 flex items-center justify-between">
  <p class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
    <Icon name="compose" size={16} /> Draft
  </p>
  <div class="flex items-center gap-2">
    <Button onclick={() => persist("draft")} disabled={busy || savingDraft} variant="ghost">
      {savingDraft ? "Saving…" : "Save draft"}
    </Button>
    <Button onclick={() => persist("published")} disabled={busy || savingDraft} variant="solid">
      {busy ? "Publishing…" : "Publish"}
    </Button>
  </div>
</div>

<input
  placeholder="Title"
  bind:value={title}
  oninput={() => (touched = true)}
  class="mb-6 w-full border-none bg-transparent text-3xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none sm:text-4xl"
/>

<div class="mb-6">
  <label for="post-summary" class="text-muted-foreground mb-1.5 block text-xs font-medium">
    Description — shown in search results and link previews. Optional; the opening
    lines are used when it's blank.
  </label>
  <div class="flex items-center gap-3">
    <input
      id="post-summary"
      bind:value={summary}
      maxlength={MAX_SUMMARY}
      placeholder="One sentence on what this post is about"
      class="rounded-input border border-input bg-background shadow-btn min-w-0 flex-1 px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
    />
    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
      {summary.length}/{MAX_SUMMARY}
    </span>
  </div>
</div>

<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    <TagInput bind:tags />
  </div>
  <LanguageSelect bind:value={language} />
</div>

<BannerPicker bind:coverUrl contentHtml={html} onChange={() => (touched = true)} />

{#if EditorComponent}
  <EditorComponent {onUpdate} content={(draft?.contentJson as Content) ?? draft?.contentHtml} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}
