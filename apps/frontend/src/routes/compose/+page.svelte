<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { Content } from "@tiptap/core";
  import { beforeNavigate, goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import { confirm } from "$lib/components/ui/confirm";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const draft = data.draft;

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
  let html = $state(draft?.contentHtml ?? "");
  let json = $state<unknown>(draft?.contentJson ?? null);
  let error = $state("");
  let busy = $state(false);
  let savingDraft = $state(false);

  // Set once the author edits the title or body, so the unsaved-changes guards
  // only fire on real changes (not when simply opening and closing a draft).
  let touched = false;

  function onUpdate(h: string, j: unknown) {
    html = h;
    json = j;
    touched = true;
  }

  // There's unsaved work worth keeping if the author has edited and there's
  // some content (an empty body is `<p></p>`).
  function hasContent(): boolean {
    if (!touched) return false;
    return title.trim().length > 0 || (html.trim().length > 0 && html !== "<p></p>");
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
      const body = { title: title.trim(), contentHtml: html, contentJson: json, status };
      if (postId) {
        await endpoints().updatePost(postId, body);
      } else {
        const { post } = await endpoints().createPost(body);
        postId = post.id;
      }
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

<svelte:head><title>Write · Omicron</title></svelte:head>

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
  class="mb-6 w-full border-none bg-transparent text-4xl font-bold tracking-tight text-foreground placeholder:text-muted-foreground focus:outline-none"
/>

{#if EditorComponent}
  <EditorComponent {onUpdate} content={(draft?.contentJson as Content) ?? draft?.contentHtml} />
{:else}
  <p class="text-muted-foreground">Loading editor…</p>
{/if}

{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}
