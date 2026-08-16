<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { Collapsible } from "bits-ui";

  // The post's description: what a search engine prints under the title and what
  // a link preview shows. Genuinely optional — leave it blank and the opening
  // lines of the post are used — and most writers never touch it, so it starts
  // as one line and opens on request instead of holding a labelled input, a
  // placeholder and a counter between the title and the body of every draft.
  //
  // A post that already has one opens expanded: an author returning to edit must
  // see what they wrote without having to know it is behind a button.
  // Matches the backend's cap (services/posts.ts `normalizeSummary`), which
  // rejects anything longer — the counter is the author's warning, not the rule.
  const MAX_SUMMARY = 150;

  let {
    summary = $bindable(""),
    onChange,
  }: {
    summary?: string;
    /** Called on any change, so the page can mark itself dirty. */
    onChange?: () => void;
  } = $props();

  let open = $state(summary.trim().length > 0);
  let input = $state<HTMLInputElement | null>(null);
  let focusOnOpen = $state(false);

  // Opening is a request to type, so land the cursor there rather than making
  // the author click twice. The content is only mounted while open, so the
  // focus waits for the input to exist rather than firing into nothing.
  function onOpenChange(next: boolean) {
    if (next) focusOnOpen = true;
  }

  $effect(() => {
    if (!focusOnOpen || !input) return;
    input.focus();
    focusOnOpen = false;
  });

  // Closing discards the text: leaving a description stored but hidden behind a
  // collapsed row would publish something the author can no longer see.
  function clear() {
    summary = "";
    open = false;
    onChange?.();
  }
</script>

<Collapsible.Root bind:open {onOpenChange} class="mb-6">
  {#if !open}
    <Collapsible.Trigger>
      {#snippet child({ props })}
        <Button {...props} variant="ghost" size="xs" class="-ml-2 text-muted-foreground">
          <Icon name="plus" size={14} /> Add a description
        </Button>
      {/snippet}
    </Collapsible.Trigger>
  {/if}

  <Collapsible.Content>
    <label for="post-summary" class="mb-1.5 block text-xs font-medium text-muted-foreground">
      Description — shown in search results and link previews. Optional; the opening lines are used when it's blank.
    </label>
    <div class="flex items-center gap-3">
      <input
        id="post-summary"
        bind:this={input}
        bind:value={summary}
        oninput={() => onChange?.()}
        maxlength={MAX_SUMMARY}
        placeholder="One sentence on what this post is about"
        class="min-w-0 flex-1 rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden placeholder:text-muted-foreground focus:border-foreground"
      />
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
        {summary.length}/{MAX_SUMMARY}
      </span>
      <Button
        onclick={clear}
        variant="ghost"
        size="xs"
        class="shrink-0 text-muted-foreground"
        aria-label="Remove the description"
      >
        <Icon name="close" size={14} />
      </Button>
    </div>
  </Collapsible.Content>
</Collapsible.Root>
