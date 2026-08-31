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
  let suggestions: { slug: string; name: string; postCount: number }[] = $state([]);
  let suggestionsOpen = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const atLimit = $derived(tags.length >= max);

  function commit(slugOverride?: string) {
    const slug = slugOverride ?? normalizeTag(draft);
    draft = "";
    suggestions = [];
    suggestionsOpen = false;
    if (!slug || atLimit || tags.includes(slug)) return;
    tags = [...tags, slug];
  }

  function commitSuggestion(slug: string) {
    commit(slug);
  }

  function removeAt(i: number) {
    tags = tags.filter((_, idx) => idx !== i);
  }

  function fetchSuggestions(q: string) {
    const slug = normalizeTag(q);
    if (!slug || slug.length < 2) {
      suggestions = [];
      suggestionsOpen = false;
      return;
    }
    fetch(`/api/tags/suggest?q=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((data: { tags: { slug: string; name: string; postCount: number }[] }) => {
        const filtered = data.tags.filter((t) => !tags.includes(t.slug) && t.slug !== slug);
        suggestions = filtered.slice(0, 6);
        suggestionsOpen = suggestions.length > 0;
        return;
      })
      .catch(() => {
        suggestions = [];
        suggestionsOpen = false;
      });
  }

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(draft), 200);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      if (suggestionsOpen && suggestions.length === 1 && draft) {
        // If one strong suggestion, prefer it; otherwise commit raw draft.
        // Keep explicit Enter for raw draft — suggestion is picked by click or Tab.
      }
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length) {
      removeAt(tags.length - 1);
    } else if (e.key === "Escape") {
      suggestionsOpen = false;
    }
  }

  function onFocus() {
    if (draft) fetchSuggestions(draft);
  }

  function onBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => {
      suggestionsOpen = false;
      commit();
    }, 150);
  }
</script>

<div
  class="flex flex-wrap items-center gap-2 rounded-input border border-border-input bg-background px-3 py-2 transition-colors focus-within:border-foreground/40"
  role="group"
  aria-label="Tags"
>
  {#each tags as tag, i (tag)}
    <span
      class="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1.5 pl-3 text-sm font-medium text-foreground"
    >
      #{tag}
      <button
        type="button"
        onclick={() => removeAt(i)}
        aria-label={`Remove tag ${tag}`}
        class="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-dark-10 hover:text-foreground"
      >
        <Icon name="close" size={12} />
      </button>
    </span>
  {/each}

  {#if !atLimit}
    <div class="relative min-w-32 flex-1">
      <input
        bind:value={draft}
        oninput={onInput}
        onfocus={onFocus}
        onkeydown={onKeydown}
        onblur={onBlur}
        placeholder={tags.length ? "Add another tag" : "Add tags (press Enter)"}
        class="w-full bg-transparent py-1 text-sm outline-hidden placeholder:text-muted-foreground"
        autocomplete="off"
        aria-autocomplete="list"
        aria-expanded={suggestionsOpen}
      />
      {#if suggestionsOpen}
        <ul
          class="absolute top-full left-0 z-10 mt-1 max-h-56 w-64 overflow-auto rounded-card border border-border bg-background shadow-popover"
          role="listbox"
        >
          {#each suggestions as s (s.slug)}
            <li role="option" aria-selected="false">
              <button
                type="button"
                onmousedown={(e) => {
                  e.preventDefault();
                  commitSuggestion(s.slug);
                }}
                class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span class="font-medium">#{s.name}</span>
                <span class="text-xs text-muted-foreground">{s.postCount} posts</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
<p class="mt-1.5 text-xs text-muted-foreground">{hint}</p>
{#if suggestionsOpen}
  <p class="mt-1 text-xs text-muted-foreground">
    Similar tags available — pick a canonical one to avoid fragmentation.
  </p>
{/if}
