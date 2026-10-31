<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { Editor } from "@tiptap/core";
  import type { Node } from "@tiptap/pm/model";
  import { Collapsible, Label, Select } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
  import Button from "#lib/components/ui/Button.svelte";
  import { documentElements, findText, focusElement, type TextMatch } from "./navigation";

  let { editor, doc, onAlternative }: { editor: Editor; doc: Node; onAlternative: (match: TextMatch) => void } =
    $props();
  const id = $props.id();
  let query = $state("");
  let index = $state(0);
  const matches = $derived(findText(doc, query));
  const elements = $derived(documentElements(doc));
  const current = $derived(matches[index % (matches.length || 1)]);

  function openResult() {
    if (!current) return;
    if (current.alternative) onAlternative(current);
    else editor.chain().focus().setTextSelection({ from: current.pos, to: current.end }).run();
  }
</script>

<Collapsible.Root class="mt-4 rounded-card border border-border bg-background-alt p-4">
  <Collapsible.Trigger
    class="inline-flex h-10 items-center gap-2 rounded-input px-3 text-sm font-medium text-foreground hover:bg-muted"
  >
    <Icon name="search" size={16} /> Find and navigate
  </Collapsible.Trigger>
  <Collapsible.Content class="mt-3 space-y-3 text-sm">
    <p class="text-muted-foreground">
      Find text, including image descriptions and table captions, or jump directly to a document element.
    </p>
    <div class="flex flex-col gap-1.5">
      <Label.Root for={`${id}-find`} class="text-sm leading-none font-medium">Find in article</Label.Root>
      <input
        id={`${id}-find`}
        type="search"
        bind:value={query}
        oninput={() => (index = 0)}
        class="rounded-input border border-input bg-background px-3.5 py-2.5 text-sm shadow-btn outline-hidden focus:border-foreground"
      />
    </div>
    <p role="status">
      {query
        ? matches.length
          ? `Result ${(index % matches.length) + 1} of ${matches.length}: ${current.label}`
          : "No matches found."
        : "Enter text to search."}
    </p>
    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!matches.length}
        onclick={() => (index = (index - 1 + matches.length) % matches.length)}>Previous result</Button
      >
      <Button
        variant="outline"
        size="sm"
        disabled={!matches.length}
        onclick={() => (index = (index + 1) % matches.length)}>Next result</Button
      >
      <Button variant="outline" size="sm" disabled={!current} onclick={openResult}>Edit result</Button>
    </div>
    <Select.Root type="single" value="" onValueChange={(value) => focusElement(editor, Number(value))}>
      <Select.Trigger
        aria-label="Go to document element"
        class="inline-flex h-10 w-full items-center justify-between gap-2 rounded-input border border-border-input bg-background px-3 text-sm shadow-btn outline-hidden transition-colors focus:border-foreground"
      >
        Go to document element <Icon name="chevronDown" size={15} />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          sideOffset={6}
          class="z-50 max-h-72 w-(--bits-select-anchor-width) overflow-y-auto rounded-card border border-muted bg-background p-1 shadow-popover"
        >
          <Select.Viewport>
            {#each elements as element (element.pos)}
              <Select.Item
                value={String(element.pos)}
                label={element.label}
                class="flex h-9 w-full items-center gap-2 rounded-button px-2 text-sm outline-hidden select-none data-highlighted:bg-muted"
              >
                <span class="truncate">{element.label}</span>
              </Select.Item>
            {/each}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </Collapsible.Content>
</Collapsible.Root>
