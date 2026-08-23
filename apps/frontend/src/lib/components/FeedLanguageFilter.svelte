<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon, { type IconName } from "$lib/components/Icon.svelte";
  import { LANGUAGES, languageLabel } from "$lib/languages";
  import { reading, type FeedLangMode } from "$lib/prefs.svelte";
  import { Button as ButtonPrimitive, Select } from "bits-ui";

  let { compact = false }: { compact?: boolean } = $props();

  const langModeOptions: { value: FeedLangMode; label: string; icon?: IconName }[] = [
    { value: "show", label: "Show only these" },
    { value: "hide", label: "Hide these", icon: "close" },
  ];
  const availableLanguages = $derived(LANGUAGES.filter((l) => !reading.feedLangs.includes(l.code)));
  let addLangValue = $state("");
  function addLanguage(code: string) {
    if (code) reading.addFeedLang(code);
    addLangValue = "";
  }
</script>

<div class={compact ? "" : "mt-6 border-t border-border pt-6"}>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
    <div>
      <p class="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Icon name="languages" size={15} /> Feed languages
      </p>
      <p class="text-xs text-muted-foreground">
        Filter which languages appear in your Local and Global feeds. Articles with no set language are always shown.
      </p>
    </div>
    <div
      class="inline-flex items-center gap-1 self-start rounded-input border border-input bg-background-alt p-1 shadow-btn sm:self-auto"
    >
      {#each langModeOptions as opt (opt.value)}
        <ButtonPrimitive.Root
          onclick={() => reading.setFeedLangMode(opt.value)}
          aria-pressed={reading.feedLangMode === opt.value}
          class={`inline-flex h-8 items-center gap-1 rounded-button px-3 text-sm font-medium whitespace-nowrap active:scale-[0.98] ${
            reading.feedLangMode === opt.value
              ? "bg-background text-foreground shadow-mini"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {#if opt.icon}<Icon name={opt.icon} size={13} />{/if}
          {opt.label}
        </ButtonPrimitive.Root>
      {/each}
    </div>
  </div>

  <div class="mt-4 flex flex-wrap items-center gap-2">
    {#each reading.feedLangs as code (code)}
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

  {#if reading.feedLangs.length === 0}
    <p class="mt-2 text-xs text-muted-foreground">No filter set — articles in every language are shown.</p>
  {/if}
</div>
