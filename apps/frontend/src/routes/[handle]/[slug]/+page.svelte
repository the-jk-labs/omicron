<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Dialog, DropdownMenu, Label, Separator } from "bits-ui";
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import Comments from "$lib/components/Comments.svelte";
  import TagList from "$lib/components/TagList.svelte";
  import SaveToListButton from "$lib/components/SaveToListButton.svelte";
  import { formatDate, readTime } from "$lib/format";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const post = $derived(data.post);
  const minutes = $derived(readTime(post.contentHtml));
  // Origin instance (host) parsed from a remote author's `user@host` handle.
  const originInstance = $derived(post.author.username.split("@")[1] ?? null);

  // Like state is seeded from the SSR payload (viewer-aware) and updated locally.
  let liked = $state(data.post.liked);
  let likeCount = $state(data.post.likeCount);
  let commentCount = $state(data.post.commentCount);
  let busy = $state(false);
  let deleting = $state(false);
  let deleteError = $state("");
  let shared = $state(false);

  // Authoring controls: edit is author-only; delete is author or admin. Neither
  // applies to federated posts owned by a remote instance.
  const canEdit = $derived(!!data.user && !post.remote && data.user.id === post.author.id);
  const canManage = $derived(
    !!data.user && !post.remote && (data.user.id === post.author.id || data.user.isAdmin),
  );
  // Any signed-in reader can report a post that isn't their own (local or remote).
  const canReport = $derived(!!data.user && data.user.id !== post.author.id);

  // Report flow — a dialog for an optional reason, then a one-shot flag.
  let reportOpen = $state(false);
  let reportReason = $state("");
  let reportBusy = $state(false);
  let reportDone = $state(false);
  let reportError = $state("");

  function onReportOpenChange(next: boolean) {
    reportOpen = next;
    if (next) {
      reportReason = "";
      reportError = "";
      reportDone = false;
    }
  }

  async function submitReport() {
    reportBusy = true;
    reportError = "";
    try {
      await endpoints().report("post", post.id, reportReason.trim() || undefined);
      reportDone = true;
      setTimeout(() => (reportOpen = false), 1200);
    } catch (err) {
      reportError = err instanceof ApiError ? err.message : "Failed to submit report.";
    } finally {
      reportBusy = false;
    }
  }

  // Verbatim Bits UI docs DropdownMenu.Item class (v3 syntax).
  const itemClass =
    "rounded-button data-[highlighted]:bg-muted !ring-0 !ring-transparent flex h-10 w-full cursor-pointer select-none items-center gap-2.5 py-3 pl-3 pr-1.5 text-sm font-medium focus-visible:outline-none";

  // Share via the native sheet where available, falling back to copying the link.
  async function sharePost() {
    const url = window.location.href;
    const title = post.title ?? "Post";
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      shared = true;
      setTimeout(() => (shared = false), 2000);
    } catch {
      // Ignore — nothing more we can do.
    }
  }

  async function deletePost() {
    if (deleting) return;
    const ok = await confirm({
      title: "Delete post",
      description: "Delete this post? This can't be undone.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleting = true;
    deleteError = "";
    try {
      await endpoints().deletePost(post.id);
      goto("/");
    } catch (err) {
      deleteError = err instanceof ApiError ? err.message : "Failed to delete.";
      deleting = false;
    }
  }

  async function toggleLike() {
    if (!data.user) {
      goto("/login");
      return;
    }
    if (busy) return;
    busy = true;
    // Optimistic update.
    const wasLiked = liked;
    liked = !liked;
    likeCount += liked ? 1 : -1;
    try {
      const res = wasLiked
        ? await endpoints().unlikePost(post.id)
        : await endpoints().likePost(post.id);
      liked = res.liked;
      likeCount = res.likeCount;
    } catch {
      // Revert on failure.
      liked = wasLiked;
      likeCount += wasLiked ? 1 : -1;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{post.title ?? "Post"} · Omicron</title></svelte:head>

<article>
  {#if deleteError}
    <p class="mb-6 rounded-input border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {deleteError}
    </p>
  {/if}

  {#if post.title}
    <h1 class="mb-6 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">{post.title}</h1>
  {/if}

  <div class="flex items-center gap-3 pb-8">
    <Avatar name={post.author.displayName} src={post.author.avatarUrl ?? undefined} size={44} />
    <div class="text-sm">
      <Button href={`/@${post.author.username}`} variant="plain" class="font-medium text-foreground hover:underline">
        {post.author.displayName}
      </Button>
      <div class="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>{formatDate(post.createdAt)}</span>
        <Separator.Root orientation="vertical" class="bg-border shrink-0 data-[orientation=vertical]:h-3 data-[orientation=vertical]:w-px" />
        <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
        {#if post.remote && originInstance}
          <Separator.Root orientation="vertical" class="bg-border shrink-0 data-[orientation=vertical]:h-3 data-[orientation=vertical]:w-px" />
          <span class="flex items-center gap-1"><Icon name="globe" size={13} /> {originInstance}</span>
        {/if}
      </div>
    </div>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="border-input text-muted-foreground shadow-btn hover:bg-muted hover:text-foreground ml-auto inline-flex size-9 items-center justify-center rounded-full border active:scale-[0.98]"
        aria-label="Post options"
      >
        <Icon name="more" size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="end"
          class="border-muted bg-background shadow-popover z-30 w-[180px] rounded-xl border px-1 py-1.5 focus-visible:outline-none"
        >
          <DropdownMenu.Item onSelect={sharePost} class={itemClass}>
            <Icon name={shared ? "check" : "share"} size={18} />
            {shared ? "Link copied" : "Share"}
          </DropdownMenu.Item>
          {#if canEdit}
            <DropdownMenu.Item onSelect={() => goto(`/posts/${post.id}/edit`)} class={itemClass}>
              <Icon name="edit" size={18} /> Edit
            </DropdownMenu.Item>
          {/if}
          {#if canReport}
            <DropdownMenu.Item onSelect={() => onReportOpenChange(true)} class={itemClass}>
              <Icon name="flag" size={18} /> Report
            </DropdownMenu.Item>
          {/if}
          {#if canManage}
            <DropdownMenu.Item onSelect={deletePost} class={`${itemClass} text-destructive`}>
              <Icon name="trash" size={18} /> Delete
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>

  <!-- Content is server-rendered HTML produced by the Tiptap editor. -->
  <div class="prose-omicron">
    {@html post.contentHtml}
  </div>

  {#if post.tags?.length}
    <TagList tags={post.tags} class="mt-8" />
  {/if}

  <!-- Engagement bar -->
  <div class="mt-8 flex items-center gap-2 py-2.5">
    <Button
      onclick={toggleLike}
      variant="ghost"
      class={liked ? "text-foreground" : "text-muted-foreground"}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
    >
      <Icon name="heart" size={18} class={liked ? "fill-current" : ""} />
      <span class="tabular-nums">{likeCount}</span>
    </Button>
    <a href="#responses" class="text-muted-foreground hover:bg-muted inline-flex h-10 items-center gap-1.5 rounded-input px-4 text-sm font-medium">
      <Icon name="comment" size={18} />
      <span class="tabular-nums">{commentCount}</span>
    </a>
    <div class="ml-auto inline-flex h-10 items-center px-2">
      <SaveToListButton postId={post.id} signedIn={!!data.user} />
    </div>
  </div>
</article>

<div id="responses" class="mt-12">
  <Comments
    postId={post.id}
    initial={data.comments}
    user={data.user}
    onCountChange={(delta) => (commentCount += delta)}
  />
</div>

<Dialog.Root bind:open={reportOpen} onOpenChange={onReportOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class="rounded-card bg-background shadow-popover fixed left-1/2 top-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 border border-border p-6 sm:max-w-[440px]"
    >
      <Dialog.Title class="text-foreground text-lg font-semibold tracking-tight">Report post</Dialog.Title>
      <Dialog.Description class="text-muted-foreground mt-1 text-sm">
        Flag this post for a moderator to review. Tell us what's wrong (optional).
      </Dialog.Description>

      {#if reportDone}
        <div class="mt-5 flex items-center gap-2 text-sm text-foreground">
          <Icon name="check" size={16} /> Thanks — a moderator will take a look.
        </div>
      {:else}
        <div class="mt-5 flex flex-col gap-1.5">
          <Label.Root for="report-reason" class="text-sm font-medium leading-none">Reason</Label.Root>
          <textarea
            id="report-reason"
            bind:value={reportReason}
            rows={3}
            maxlength={1000}
            placeholder="e.g. spam, harassment, illegal content"
            class="rounded-input border border-input bg-background shadow-btn resize-none px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
          ></textarea>
          {#if reportError}<p class="text-destructive text-sm">{reportError}</p>{/if}
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <Dialog.Close
            class="text-foreground hover:bg-muted inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <Button variant="destructive" disabled={reportBusy} onclick={submitReport}>
            <Icon name="flag" size={15} /> {reportBusy ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>