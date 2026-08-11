<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { fitPre } from "$lib/actions/fitPre";
  import { endpoints, ApiError } from "$lib/api";
  import EmojiTrigger from "$lib/components/EmojiTrigger.svelte";
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import { Tabs, Toolbar } from "bits-ui";

  // Markdown editor for the profile's custom section — a GitHub-README-style
  // block the author lays out however they like.
  //
  // Deliberately a plain textarea over Markdown source, not a rich-text editor:
  // the point is full control, and Markdown is the thing authors already know
  // how to be creative in. The toolbar only inserts syntax, so anything typed by
  // hand keeps working.
  //
  // The preview is rendered by the *backend*, through the exact render +
  // sanitize path used on save (see lib/markdown.ts). That keeps one Markdown
  // implementation in the codebase and guarantees the preview can't promise
  // markup the sanitizer will later strip.
  let { value = $bindable(""), maxLength }: { value?: string; maxLength: number } = $props();

  let textarea = $state<HTMLTextAreaElement | null>(null);
  let tab = $state("write");

  let previewHtml = $state("");
  let previewError = $state("");
  let previewLoading = $state(false);
  // Guards against a slow earlier request overwriting a newer preview.
  let previewToken = 0;
  // The source the current `previewHtml` was rendered from, so switching back to
  // Preview without edits doesn't refetch.
  let previewedSource: string | null = null;

  async function loadPreview() {
    const source = value;
    if (previewedSource === source) return;
    if (!source.trim()) {
      previewHtml = "";
      previewError = "";
      previewedSource = source;
      return;
    }
    const token = ++previewToken;
    previewLoading = true;
    previewError = "";
    try {
      const { html } = await endpoints().previewCustomSection(source);
      if (token !== previewToken) return; // superseded
      previewHtml = html;
      previewedSource = source;
    } catch (err) {
      if (token !== previewToken) return;
      previewHtml = "";
      previewError = err instanceof ApiError ? err.message : "Could not render the preview.";
    } finally {
      if (token === previewToken) previewLoading = false;
    }
  }

  function onTabChange(next: string) {
    tab = next;
    if (next === "preview") void loadPreview();
  }

  // ── Markdown insertion ────────────────────────────────────────────────
  // Every action rewrites the textarea value and restores a sensible selection,
  // so the author can keep typing without reaching for the mouse again.

  function apply(next: string, selStart: number, selEnd: number) {
    if (next.length > maxLength) return;
    value = next;
    // The DOM value updates on the next tick; move the caret after it lands.
    queueMicrotask(() => {
      textarea?.focus();
      textarea?.setSelectionRange(selStart, selEnd);
    });
  }

  // Wraps the selection (or inserts `placeholder` when nothing is selected).
  function wrap(before: string, after: string, placeholder: string) {
    const el = textarea;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    apply(next, start + before.length, start + before.length + selected.length);
  }

  // Prefixes every selected line — headings, lists, quotes.
  function prefixLines(marker: string | ((i: number) => string), placeholder: string) {
    const el = textarea;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    // Grow the range to whole lines so a mid-line cursor still marks its line.
    const from = value.lastIndexOf("\n", start - 1) + 1;
    const toIndex = value.indexOf("\n", end);
    const to = toIndex === -1 ? value.length : toIndex;
    const block = value.slice(from, to) || placeholder;
    const marked = block
      .split("\n")
      .map((line, i) => (typeof marker === "string" ? marker : marker(i)) + line)
      .join("\n");
    const next = value.slice(0, from) + marked + value.slice(to);
    apply(next, from, from + marked.length);
  }

  // Drops a multi-line block (code fence, table, divider) at the cursor,
  // padded with blank lines so it parses as its own block.
  function insertBlock(block: string) {
    const el = textarea;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const before = value.slice(0, start);
    const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const body = lead + block;
    const next = before + body + value.slice(end);
    apply(next, start + body.length, start + body.length);
  }

  function insertEmoji(emoji: string) {
    const el = textarea;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = value.slice(0, start) + emoji + value.slice(end);
    apply(next, start + emoji.length, start + emoji.length);
  }

  const TABLE = "| Column | Column |\n| --- | --- |\n| Cell | Cell |\n";
  const DETAILS = "<details>\n<summary>Click to expand</summary>\n\nHidden content.\n\n</details>\n";

  type Tool = { icon: IconName; label: string; run: () => void; divider?: boolean };
  const tools: Tool[] = [
    { icon: "h2", label: "Heading", run: () => prefixLines("## ", "Heading") },
    { icon: "bold", label: "Bold", run: () => wrap("**", "**", "bold text") },
    { icon: "italic", label: "Italic", run: () => wrap("_", "_", "italic text") },
    { icon: "strike", label: "Strikethrough", run: () => wrap("~~", "~~", "struck text") },
    { icon: "code", label: "Inline code", run: () => wrap("`", "`", "code") },
    { icon: "link", label: "Link", divider: true, run: () => wrap("[", "](https://)", "label") },
    { icon: "image", label: "Image", run: () => wrap("![", "](https://)", "alt text") },
    { icon: "list", label: "Bullet list", divider: true, run: () => prefixLines("- ", "List item") },
    {
      icon: "orderedList",
      label: "Numbered list",
      run: () => prefixLines((i) => `${i + 1}. `, "List item"),
    },
    { icon: "check", label: "Task list", run: () => prefixLines("- [ ] ", "To do") },
    { icon: "quote", label: "Quote", run: () => prefixLines("> ", "Quoted text") },
    { icon: "codeBlock", label: "Code block", divider: true, run: () => insertBlock("```\ncode\n```\n") },
    { icon: "table", label: "Table", run: () => insertBlock(TABLE) },
    { icon: "chevronDown", label: "Collapsible section", run: () => insertBlock(DETAILS) },
    { icon: "hr", label: "Divider", run: () => insertBlock("---\n") },
  ];

  const btn =
    "rounded-9px bg-background-alt hover:bg-muted active:bg-dark-10 text-foreground/60 inline-flex size-9 shrink-0 items-center justify-center transition-all active:scale-[0.98]";
  const tabTrigger =
    "rounded-9px data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground h-8 px-3 text-sm font-medium transition-colors hover:text-foreground";
</script>

<Tabs.Root value={tab} onValueChange={onTabChange} class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <Tabs.List class="flex items-center gap-1">
      <Tabs.Trigger value="write" class={tabTrigger}>Write</Tabs.Trigger>
      <Tabs.Trigger value="preview" class={tabTrigger}>Preview</Tabs.Trigger>
    </Tabs.List>
    <p class="text-xs text-muted-foreground">{value.length.toLocaleString()}/{maxLength.toLocaleString()}</p>
  </div>

  <Tabs.Content value="write" class="flex flex-col gap-2 focus-visible:outline-none">
    <Toolbar.Root
      class="no-scrollbar flex w-full items-center gap-0.5 overflow-x-auto rounded-10px border border-border bg-background-alt px-2 py-1 shadow-mini"
    >
      {#each tools as tool (tool.label)}
        {#if tool.divider}
          <span class="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true"></span>
        {/if}
        <Toolbar.Button onclick={tool.run} aria-label={tool.label} title={tool.label} class={btn}>
          <Icon name={tool.icon} size={16} />
        </Toolbar.Button>
      {/each}
      <span class="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true"></span>
      <EmojiTrigger onPick={insertEmoji} align="end" class={btn} />
    </Toolbar.Root>

    <textarea
      bind:this={textarea}
      bind:value
      rows={14}
      maxlength={maxLength}
      spellcheck="false"
      placeholder={"# Hi, I'm …\n\nWrite anything here — headings, lists, tables, images, links.\nMarkdown and simple HTML both work."}
      class="w-full resize-y rounded-input border border-input bg-background px-3.5 py-2.5 font-mono text-sm leading-relaxed shadow-btn outline-none placeholder:text-muted-foreground focus:border-foreground"
    ></textarea>
  </Tabs.Content>

  <Tabs.Content
    value="preview"
    class="min-h-[220px] rounded-card border border-border bg-background-alt px-5 py-4 focus-visible:outline-none"
  >
    {#if previewLoading}
      <p class="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon name="spinner" size={15} class="animate-spin" /> Rendering…
      </p>
    {:else if previewError}
      <p class="text-sm text-destructive">{previewError}</p>
    {:else if previewHtml}
      <!-- Rendered and sanitized server-side; see backend lib/markdown.ts. -->
      <div use:fitPre class="prose-omicron prose-compact min-w-0">{@html previewHtml}</div>
    {:else}
      <p class="text-sm text-muted-foreground">Nothing to preview yet.</p>
    {/if}
  </Tabs.Content>
</Tabs.Root>
