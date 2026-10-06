<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import { Button as ButtonPrimitive, Select } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
  import { LANGUAGES, languageLabel } from "#lib/languages.js";
  import { type FeedFilter, type FeedLangMode, reading } from "#lib/prefs.svelte.js";

  let { compact = false }: { compact?: boolean } = $props();

  const langModeOptions: { value: FeedLangMode; label: string }[] = [
    { value: "show", label: "Show only these" },
    { value: "hide", label: "Hide these" },
  ];

  // The browser reads the saved filter from cookies; the server gets the same
  // cookies through the layout data, so both renders agree.
  const saved = $derived(page.data.feedFilter as FeedFilter | undefined);
  const mode = $derived(browser || !saved ? reading.feedLangMode : saved.mode);
  const langs = $derived(browser || !saved ? reading.feedLangs : saved.langs);
  const dismissed = $derived(browser || !saved ? reading.feedLangCardDismissed : saved.cardDismissed);
  const availableLanguages = $derived(LANGUAGES.filter((l) => !langs.includes(l.code)));
  let addLangValue = $state("");
  function addLanguage(code: string) {
    if (code) reading.addFeedLang(code);
    addLangValue = "";
  }
</script>

{#if !(compact && dismissed)}
  <div
    class={compact
      ? "relative mb-6 rounded-card border border-border bg-background p-4"
      : "mt-6 border-t border-border pt-6"}
  >
    {#if compact}
      <ButtonPrimitive.Root
        onclick={() => reading.dismissFeedLangCard()}
        aria-label="Hide this card"
        class="absolute top-3 right-3 inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon name="close" size={13} />
      </ButtonPrimitive.Root>
    {/if}
    <!-- Compact card: the dismiss button owns the top-right corner, so the
         header row stays out of its lane — the text on stacked layouts, the
         whole row (including the mode toggle) once it sits side by side. -->
    <div
      class={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${compact ? "sm:pr-8" : ""}`}
    >
      <div class={compact ? "min-w-0 flex-1 pr-8 sm:pr-0" : "min-w-0 flex-1"}>
        <p class="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon name="languages" size={15} /> Feed languages
        </p>
        <p class="text-xs text-muted-foreground">Filter the languages in your Local and Global feeds.</p>
      </div>
      <div
        class="inline-flex shrink-0 items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn sm:self-center"
      >
        {#each langModeOptions as opt (opt.value)}
          <ButtonPrimitive.Root
            onclick={() => reading.setFeedLangMode(opt.value)}
            aria-pressed={mode === opt.value}
            class={`inline-flex h-8 items-center rounded-button px-3 text-sm font-medium whitespace-nowrap active:scale-[0.98] ${
              mode === opt.value
                ? "bg-background text-foreground shadow-mini"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </ButtonPrimitive.Root>
        {/each}
      </div>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      {#each langs as code (code)}
        <span
          class="inline-flex items-center gap-1.5 rounded-button border border-border bg-muted py-1 pr-1.5 pl-3 text-sm text-foreground"
        >
          {languageLabel(code)}
          <ButtonPrimitive.Root
            onclick={() => reading.removeFeedLang(code)}
            aria-label={`Remove ${languageLabel(code)}`}
            class="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-dark-10 hover:text-foreground"
          >
            <Icon name="close" size={13} />
          </ButtonPrimitive.Root>
        </span>
      {/each}

      {#if availableLanguages.length > 0}
        <Select.Root type="single" value={addLangValue} onValueChange={addLanguage}>
          <Select.Trigger
            class="inline-flex h-9 items-center gap-1.5 rounded-input border border-border-input bg-background px-3 text-sm text-muted-foreground shadow-btn outline-hidden transition-colors hover:text-foreground focus:border-foreground"
            aria-label="Add a language"
          >
            <Icon name="plus" size={15} /> Add language
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              class="z-50 max-h-72 w-52 overflow-y-auto rounded-card border border-muted bg-background p-1 shadow-popover"
              sideOffset={6}
            >
              <Select.Viewport>
                {#each availableLanguages as lang (lang.code)}
                  <Select.Item
                    value={lang.code}
                    label={lang.name}
                    class="flex h-9 w-full items-center gap-2 rounded-button px-2 text-sm outline-hidden select-none data-highlighted:bg-muted"
                  >
                    <span class="truncate">{lang.name}</span>
                    <span class="truncate text-muted-foreground">{lang.native}</span>
                  </Select.Item>
                {/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      {/if}
    </div>
  </div>
{/if}
