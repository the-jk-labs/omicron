<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { beforeNavigate, goto, replaceState } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import { Autosave } from "$lib/autosave.svelte";
  import BannerPicker from "$lib/components/BannerPicker.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import LanguageSelect from "$lib/components/LanguageSelect.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import SaveStatus from "$lib/components/SaveStatus.svelte";
  import SummaryField from "$lib/components/SummaryField.svelte";
  import TagInput from "$lib/components/TagInput.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import { reading } from "$lib/prefs.svelte";
  import type { CoverCredit } from "$lib/types";
  import type { Content } from "@tiptap/core";
  import { onDestroy, onMount, untrack } from "svelte";
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
  let language = $state<string | null>(draft ? (draft.language ?? null) : reading.composeLang);
  // The one-line description search engines print under the title, and link
  // previews show. Left empty it falls back to a truncation of the opening
  // paragraph — which is what every post used to get, often cut mid-clause.
  let summary = $state(draft?.summary ?? "");
  // The banner the author picked, if any. Null means "use the first image in
  // the post", which the picker previews and the server resolves on read — so
  // a draft saved without one is not silently committed to whatever image
  // happened to be first at the time.
  let coverUrl = $state<string | null>(draft?.coverUrl ?? null);
  let coverCredit = $state<CoverCredit | null>(draft?.coverCredit ?? null);
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
    change();
  }

  /** Every author-visible edit funnels through here, so nothing escapes autosave. */
  function change() {
    touched = true;
    autosave.schedule();
  }

  // The tag input mutates `tags` directly; mark touched when it diverges from
  // the draft's original tags.
  const initialTags = (draft?.tags?.map((t) => t.name) ?? []).join(",");
  // Must mirror `language`'s initial value, not the draft's — a new post now
  // starts at the remembered default, and comparing that against null would
  // mark the page dirty the instant it opened, so simply looking at the
  // composer and leaving would raise the unsaved-changes prompt.
  const initialLanguage = draft ? (draft.language ?? null) : reading.composeLang;
  const initialSummary = draft?.summary ?? "";
  $effect(() => {
    const changed = tags.join(",") !== initialTags || language !== initialLanguage || summary !== initialSummary;
    if (changed) change();
  });

  // There's unsaved work worth keeping if the author has edited and there's
  // some content (an empty body is `<p></p>`).
  function hasContent(): boolean {
    if (!touched) return false;
    return (
      title.trim().length > 0 || tags.length > 0 || coverUrl !== null || (html.trim().length > 0 && html !== "<p></p>")
    );
  }

  // `bypass` lets our own post-save navigations through the unsaved-changes guard.
  let bypass = false;

  /** Everything the composer holds, in the shape the API takes. */
  function body() {
    return {
      title: title.trim(),
      contentHtml: html,
      contentJson: json,
      language,
      // Null, not "", so the reader falls back to the derived excerpt
      // rather than showing an empty description.
      summary: summary.trim() || null,
      coverUrl,
      coverCredit,
      tags,
    };
  }

  // Autosave, drafts only. The composer is the draft surface — a published post
  // is edited on its own page — so a background write here can never push an
  // unfinished sentence to readers or federate an Update to remote instances.
  //
  // `status` is only ever sent on the create: an update that omits it leaves
  // the post a draft, so no timer can publish anything.
  const autosave = new Autosave({
    canSave: () => hasContent(),
    save: async () => {
      if (postId) {
        await endpoints().updatePost(postId, body());
        return;
      }
      const { post } = await endpoints().createPost({ ...body(), status: "draft" });
      postId = post.id;
      // Put the new draft's id in the address bar, so a reload — or the browser
      // restoring the tab — continues this draft instead of starting a second
      // one and leaving the author with duplicates in /drafts.
      replaceState(`/compose?id=${post.id}`, {});
    },
  });
  onDestroy(() => autosave.stop());

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
    // Hand over from autosave cleanly: no new timer may fire, and an autosave
    // already in flight must land before this write, or a create could race a
    // create and leave two drafts — or an old body could overwrite the new one.
    autosave.stop();
    await autosave.flush();
    try {
      const payload = { ...body(), status };
      if (postId) {
        await endpoints().updatePost(postId, payload);
      } else {
        const { post } = await endpoints().createPost(payload);
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
      // The editor stays open on a failure, so autosave has to come back with
      // it — otherwise a failed publish silently leaves the author unprotected.
      autosave.resume();
      error = err instanceof ApiError ? err.message : "Failed to save.";
    }
  }

  // Warn on full-page unload (closing or reloading the tab) only while a change
  // is still unsaved. Autosave means that window is now a couple of seconds
  // wide, not the whole session — but closing the tab inside it would still
  // lose the change, and the browser gives us no time to write it first.
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (autosave.dirty && hasContent() && !bypass) {
      e.preventDefault();
      e.returnValue = "";
    }
  }
  // Registered on mount and torn down by its own cleanup: `window` does not
  // exist while this component renders on the server, and Svelte runs onDestroy
  // there too — so reaching for it from onDestroy threw during SSR and the page
  // never rendered at all.
  onMount(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  // Leaving via an in-app link with a pending change: write it out and carry on
  // to where they were going. This used to ask whether to save as a draft —
  // with autosave the draft already exists, so the question had no answer left
  // that changed anything.
  beforeNavigate(async (nav) => {
    if (bypass || nav.willUnload || !autosave.dirty || !hasContent()) return;
    nav.cancel();
    const target = nav.to?.url;
    await autosave.flush();
    // Still dirty means that write failed. Navigating anyway would throw the
    // change away without telling anyone, so this is the one case left that is
    // genuinely the author's call.
    if (autosave.dirty) {
      const leave = await confirm({
        title: "Leave without saving?",
        description: "Your last change could not be saved. Leaving now loses it — staying lets the editor try again.",
        confirmText: "Leave",
        cancelText: "Stay",
      });
      if (!leave) return;
    }
    bypass = true;
    if (target) goto(target);
  });
</script>

<PageTitle text="Write" />

<div class="mb-8 flex items-center justify-between">
  <p class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
    <Icon name="compose" size={16} /> Draft
  </p>
  <div class="flex items-center gap-2">
    <SaveStatus status={autosave.state} savedAt={autosave.savedAt} error={autosave.error} />
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
  oninput={change}
  class="mb-6 w-full border-none bg-transparent text-3xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-hidden sm:text-4xl"
/>

<SummaryField bind:summary onChange={change} />

<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
  <div class="min-w-0 flex-1">
    <TagInput bind:tags />
  </div>
  <LanguageSelect bind:value={language} />
</div>

<BannerPicker bind:coverUrl bind:coverCredit contentHtml={html} onChange={change} />

{#if EditorComponent}
  <EditorComponent {onUpdate} content={(draft?.contentJson as Content) ?? draft?.contentHtml} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}
