<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { endpoints, ApiError } from "$lib/api";
  import Comments from "$lib/components/Comments.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import PageTitle from "$lib/components/PageTitle.svelte";
  import PostCard from "$lib/components/PostCard.svelte";
  import RecommendButton from "$lib/components/RecommendButton.svelte";
  import SaveToListButton from "$lib/components/SaveToListButton.svelte";
  import TagList from "$lib/components/TagList.svelte";
  import Time from "$lib/components/Time.svelte";
  import Avatar from "$lib/components/ui/Avatar.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { confirm } from "$lib/components/ui/confirm";
  import { countLabel, readTime } from "$lib/format";
  import { languageLabel } from "$lib/languages";
  import { Dialog, DropdownMenu, Label, Separator } from "bits-ui";
  import { untrack } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const post = $derived(data.post);
  const minutes = $derived(readTime(post.contentHtml));
  // The hero above the article only renders for an explicit cover choice, not
  // `bannerUrl`'s body-image fallback (see backend lib/cover.ts's `bannerOf`)
  // — this is the one surface that also renders the full body, so promoting
  // an arbitrary body image to a hero would either duplicate it (if it's
  // already the post's opening element) or visually remove it from where the
  // author placed it (if it isn't). Feed cards, share cards, and RSS still use
  // `bannerUrl` as-is; they never show the body alongside it.
  let coverFailed = $state(false);
  $effect(() => {
    void post.coverUrl;
    coverFailed = false;
  });
  // Origin instance (host) parsed from a remote author's `user@host` handle.
  const originInstance = $derived(post.author.username.split("@")[1] ?? null);

  // Like state is seeded from the SSR payload (viewer-aware) and updated locally.
  let liked = $state(untrack(() => data.post.liked));
  let likeCount = $state(untrack(() => data.post.likeCount));
  let commentCount = $state(untrack(() => data.post.commentCount));
  let busy = $state(false);
  // Re-seed when navigating between posts client-side; local like/comment
  // actions mutate these without touching `data`, so they aren't undone.
  $effect(() => {
    liked = data.post.liked;
    likeCount = data.post.likeCount;
    commentCount = data.post.commentCount;
  });
  // The counts sit inside the buttons visually, but an `aria-label` replaces
  // the content as the accessible name — so the labels carry the counts
  // themselves, or a screen reader hears "Like" and never the number.
  const likeLabel = $derived(`${liked ? "Unlike" : "Like"} (${countLabel(likeCount, "like")})`);
  const commentLabel = $derived(countLabel(commentCount, "response"));
  // Enhance server-rendered code blocks with a copy-to-clipboard button. The
  // content is injected via {@html}, so we reach into the DOM after each render.
  let contentEl = $state<HTMLElement>();
  const COPY_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const CHECK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  $effect(() => {
    // Re-run whenever the rendered article changes.
    void post.contentHtml;
    const root = contentEl;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      // A block whose fence declared a filename is wrapped in a captioned
      // figure (see lib/highlight.ts); its button belongs in that caption,
      // beside the name. Everything else hosts the button itself.
      const caption = pre.parentElement?.classList.contains("code-figure")
        ? pre.parentElement.querySelector(":scope > .code-title")
        : null;
      const host = caption ?? pre;
      if (host.querySelector(":scope > .code-copy")) continue;
      if (!caption) pre.classList.add("code-block");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy";
      btn.setAttribute("aria-label", "Copy code");
      btn.innerHTML = COPY_SVG;

      let resetTimer: ReturnType<typeof setTimeout> | undefined;
      const onClick = async () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          btn.innerHTML = CHECK_SVG;
          btn.classList.add("copied");
          clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            btn.innerHTML = COPY_SVG;
            btn.classList.remove("copied");
          }, 1600);
        } catch {
          /* Clipboard unavailable (e.g. insecure context) — ignore. */
        }
      };
      btn.addEventListener("click", onClick);
      host.appendChild(btn);

      cleanups.push(() => {
        clearTimeout(resetTimer);
        btn.removeEventListener("click", onClick);
        btn.remove();
      });
    }

    return () => cleanups.forEach((fn) => fn());
  });

  let deleting = $state(false);
  let deleteError = $state("");
  let unpublishing = $state(false);
  let shared = $state(false);

  // Authoring controls: edit is author-only; delete is author or admin. Neither
  // applies to federated posts owned by a remote instance.
  const canEdit = $derived(!!data.user && !post.remote && data.user.id === post.author.id);
  const canManage = $derived(!!data.user && !post.remote && (data.user.id === post.author.id || data.user.isAdmin));
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

  // Verbatim Bits UI docs DropdownMenu.Item class.
  const itemClass =
    "rounded-button data-highlighted:bg-muted ring-0! ring-transparent! flex h-10 w-full cursor-pointer select-none items-center gap-2.5 py-3 pl-3 pr-1.5 text-sm font-medium focus-visible:outline-hidden";

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

  // Revert a published post to a draft: it leaves public feeds and any remote
  // copies are tombstoned. The author edits it from Drafts.
  async function unpublishPost() {
    if (unpublishing) return;
    const ok = await confirm({
      title: "Move to drafts",
      description:
        "Unpublish this article? It will be hidden from readers and moved to your drafts. You can publish it again later.",
      confirmText: "Move to drafts",
    });
    if (!ok) return;
    unpublishing = true;
    deleteError = "";
    try {
      await endpoints().updatePost(post.id, { status: "draft" });
      goto("/posts/manage?tab=draft");
    } catch (err) {
      deleteError = err instanceof ApiError ? err.message : "Failed to unpublish.";
      unpublishing = false;
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
      const res = wasLiked ? await endpoints().unlikePost(post.id) : await endpoints().likePost(post.id);
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

<PageTitle text={post.title ?? "Post"} />

<article>
  {#if deleteError}
    <p class="mb-6 rounded-input border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {deleteError}
    </p>
  {/if}

  {#if post.title}
    <h1 class="mb-4 text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl">{post.title}</h1>
  {/if}

  <div class="flex items-start gap-3 pb-8">
    <Avatar name={post.author.displayName} src={post.author.avatarUrl ?? undefined} size={44} />
    <div class="min-w-0 flex-1 text-sm">
      <Button href={`/@${post.author.username}`} variant="plain" class="font-medium text-foreground hover:underline">
        {post.author.displayName}
      </Button>
      <div class="flex flex-col gap-1 text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
        <Time iso={post.createdAt} />
        <Separator.Root orientation="vertical" class="hidden shrink-0 bg-border sm:block sm:h-3 sm:w-px" />
        <span class="flex items-center gap-1"><Icon name="clock" size={13} /> {minutes} min read</span>
        {#if post.remote && originInstance}
          <Separator.Root orientation="vertical" class="hidden shrink-0 bg-border sm:block sm:h-3 sm:w-px" />
          <span class="flex items-center gap-1"><Icon name="globe" size={13} /> {originInstance}</span>
        {/if}
        {#if post.language}
          <Separator.Root orientation="vertical" class="hidden shrink-0 bg-border sm:block sm:h-3 sm:w-px" />
          <span class="flex items-center gap-1"><Icon name="languages" size={13} /> {languageLabel(post.language)}</span
          >
        {/if}
      </div>
    </div>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class="ml-auto inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-input text-muted-foreground shadow-btn hover:bg-muted hover:text-foreground active:scale-[0.98]"
        aria-label="Post options"
      >
        <Icon name="more" size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="end"
          class="z-30 w-[180px] rounded-xl border border-muted bg-background px-1 py-1.5 shadow-popover focus-visible:outline-hidden"
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
          {#if canEdit && post.status === "published"}
            <DropdownMenu.Item onSelect={unpublishPost} class={itemClass}>
              <Icon name="draft" size={18} /> Move to drafts
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

  {#if post.coverUrl && !coverFailed}
    <!-- The cover is almost always this page's largest element, so it is what
         the browser (and Google's Core Web Vitals) times the load by.

         The wrapper carries a fixed aspect ratio because we never learn the
         image's real dimensions — it is hosted by whoever sent it, and no width
         or height is stored. Without a reserved box the article below it jumps
         down the moment the image arrives, which is exactly the layout shift
         CLS measures. Reserving the space costs nothing and holds the text
         still.

         `fetchpriority="high"` because it is above the fold and lazy by
         default in the browser's estimation; `decoding="async"` keeps decode
         off the main thread. Deliberately not `loading="lazy"` — that would
         delay the very element being timed. -->
    <div class="mb-8 aspect-video max-h-112 w-full overflow-hidden rounded-card border border-border">
      <!-- Decorative: the headline above it already names the post. -->
      <img
        src={post.coverUrl}
        alt=""
        fetchpriority="high"
        decoding="async"
        onerror={() => (coverFailed = true)}
        class="h-full w-full object-cover"
      />
    </div>
    {#if post.coverCredit}
      <!-- Attribution for the banner. The licences these photos are offered
           under require the creator, the source and (for Creative Commons) the
           licence itself to be named with links wherever the photo appears —
           which is why the credit is stored on the post rather than guessed at
           from the image URL. -->
      <p class="-mt-6 mb-8 text-xs text-muted-foreground">
        Photo by
        <a
          href={post.coverCredit.nameUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          class="underline hover:text-foreground"
        >
          {post.coverCredit.name}
        </a>
        on
        <a
          href={post.coverCredit.sourceUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          class="underline hover:text-foreground"
        >
          {post.coverCredit.source}
        </a>{#if post.coverCredit.license && post.coverCredit.licenseUrl}
          ·
          <a
            href={post.coverCredit.licenseUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            class="underline hover:text-foreground"
          >
            {post.coverCredit.license}
          </a>
        {/if}
      </p>
    {/if}
  {/if}

  <!-- Content is server-rendered HTML produced by the Tiptap editor. -->
  <div class="prose-omicron" bind:this={contentEl}>
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
      aria-label={likeLabel}
      title={likeLabel}
    >
      <Icon name="heart" size={18} class={liked ? "fill-current" : ""} />
      <span class="tabular-nums">{likeCount}</span>
    </Button>
    <a
      href="#responses"
      aria-label={commentLabel}
      title={commentLabel}
      class="inline-flex h-10 items-center gap-1.5 rounded-input px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
    >
      <Icon name="comment" size={18} />
      <span class="tabular-nums">{commentCount}</span>
    </a>
    <RecommendButton postId={post.id} recommended={post.recommended} recommendCount={post.recommendCount} />
    <div class="ml-auto inline-flex h-10 items-center px-2">
      <SaveToListButton postId={post.id} signedIn={!!data.user} />
    </div>
  </div>
</article>

<!-- scroll-mt clears the 64px sticky header, so the comment-count button
     above lands on the "Responses" heading rather than under the nav. -->
<div id="responses" class="mt-12 scroll-mt-20 border-t border-border pt-8">
  <Comments
    postId={post.id}
    initial={data.comments}
    user={data.user}
    onCountChange={(delta) => (commentCount += delta)}
  />
</div>

{#if data.related?.length}
  <!-- Where to go next. A post page linked onward to nothing but its author,
       which left readers with only the back button and left crawlers unable to
       reach the rest of the archive from an article. Real <a> links, rendered
       server-side, so both audiences follow the same ones.

       Last on the page, below the responses: a reader who reaches the end of an
       article is either replying to it or leaving, and an exit ramp placed
       above the reply box pushes that box off screen at the moment it is
       wanted. The thread paginates, so the bottom stays reachable. -->
  <section aria-labelledby="read-next" class="mt-12 border-t border-border pt-8">
    <h2 id="read-next" class="mb-4 text-lg font-bold tracking-tight text-foreground">Read next</h2>
    {#each data.related as related (related.id)}
      <PostCard post={related} />
    {/each}
  </section>
{/if}

<Dialog.Root bind:open={reportOpen} onOpenChange={onReportOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 w-full max-w-[94%] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-background p-6 shadow-popover sm:max-w-[440px]"
    >
      <Dialog.Title class="text-lg font-semibold tracking-tight text-foreground">Report post</Dialog.Title>
      <Dialog.Description class="mt-1 text-sm text-muted-foreground">
        Flag this post for a moderator to review. Tell us what's wrong (optional).
      </Dialog.Description>

      {#if reportDone}
        <div class="mt-5 flex items-center gap-2 text-sm text-foreground">
          <Icon name="check" size={16} /> Thanks — a moderator will take a look.
        </div>
      {:else}
        <div class="mt-5 flex flex-col gap-1.5">
          <Label.Root for="report-reason" class="text-sm leading-none font-medium">Reason</Label.Root>
          <textarea
            id="report-reason"
            bind:value={reportReason}
            rows={3}
            maxlength={1000}
            placeholder="e.g. spam, harassment, illegal content"
            class="resize-none rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
          ></textarea>
          {#if reportError}<p class="text-sm text-destructive">{reportError}</p>{/if}
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <Dialog.Close
            class="inline-flex h-10 items-center justify-center rounded-input px-4 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.98]"
          >
            Cancel
          </Dialog.Close>
          <Button variant="destructive" disabled={reportBusy} onclick={submitReport}>
            <Icon name="flag" size={15} />
            {reportBusy ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
