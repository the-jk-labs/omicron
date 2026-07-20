<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Medium-style tag input: a field for typing plus removable chips. Bits UI
     has no tag-input primitive, so this is a small headless component styled
     with the theme tokens. `tags` is bound two-way as an array of tag names. -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { MAX_TAGS_PER_POST, normalizeTag } from "$lib/tags";

  let {
    tags = $bindable([]),
    max = MAX_TAGS_PER_POST,
    hint = `Up to ${max} tags help readers discover your article.`,
  }: { tags?: string[]; max?: number; hint?: string } = $props();

  let draft = $state("");

  const atLimit = $derived(tags.length >= max);

  function commit() {
    const slug = normalizeTag(draft);
    draft = "";
    if (!slug || atLimit || tags.includes(slug)) return;
    tags = [...tags, slug];
  }

  function removeAt(i: number) {
    tags = tags.filter((_, idx) => idx !== i);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length) {
      removeAt(tags.length - 1);
    }
  }
</script>

<div
  class="rounded-input border-border-input bg-background focus-within:border-foreground/40 flex flex-wrap items-center gap-2 border px-3 py-2 transition-colors"
  role="group"
  aria-label="Tags"
>
  {#each tags as tag, i (tag)}
    <span
      class="bg-muted text-foreground inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-sm font-medium"
    >
      #{tag}
      <button
        type="button"
        onclick={() => removeAt(i)}
        aria-label={`Remove tag ${tag}`}
        class="text-muted-foreground hover:bg-dark-10 hover:text-foreground inline-flex size-4 items-center justify-center rounded-full"
      >
        <Icon name="close" size={12} />
      </button>
    </span>
  {/each}

  {#if !atLimit}
    <input
      bind:value={draft}
      onkeydown={onKeydown}
      onblur={commit}
      placeholder={tags.length ? "Add another tag" : "Add tags (press Enter)"}
      class="placeholder:text-muted-foreground min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none"
    />
  {/if}
</div>
<p class="text-muted-foreground mt-1.5 text-xs">{hint}</p>
