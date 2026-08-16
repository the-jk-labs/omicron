<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { LANGUAGES, languageLabel } from "$lib/languages";
  import { Select } from "bits-ui";

  // The article's language for the compose / edit screens. `null` means the
  // author hasn't chosen one; it federates without a language tag and is never
  // filtered out of a reader's feed.
  let { value = $bindable() }: { value: string | null } = $props();

  // bits-ui Select works in strings; map the "unset" sentinel to/from null.
  const UNSET = "__unset__";
  const selected = $derived(value ?? UNSET);

  function onValueChange(v: string) {
    value = v === UNSET ? null : v;
  }

  const triggerClass =
    "rounded-input border-border-input bg-background shadow-btn data-placeholder:text-muted-foreground inline-flex h-10 w-52 max-w-full shrink-0 items-center justify-between gap-2 border px-3 text-sm transition-colors focus:border-foreground outline-hidden";
</script>

<Select.Root type="single" value={selected} {onValueChange}>
  <Select.Trigger class={triggerClass} aria-label="Article language">
    <span class="flex min-w-0 items-center gap-2">
      <Icon name="languages" size={16} class="shrink-0 text-muted-foreground" />
      <span class="truncate">{value ? languageLabel(value) : "Language"}</span>
    </span>
    <Icon name="chevronDown" size={15} class="shrink-0 text-muted-foreground" />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content
      class="z-50 max-h-72 w-52 overflow-y-auto rounded-card border border-muted bg-background p-1 shadow-popover"
      sideOffset={6}
    >
      <Select.Viewport>
        <Select.Item
          value={UNSET}
          label="No language"
          class="flex h-9 w-full select-none items-center gap-2 rounded-button px-2 text-sm outline-hidden data-highlighted:bg-muted"
        >
          {#snippet children({ selected: isSel })}
            <span class="truncate text-muted-foreground">No language</span>
            {#if isSel}
              <Icon name="check" size={15} class="ml-auto text-foreground" />
            {/if}
          {/snippet}
        </Select.Item>
        {#each LANGUAGES as lang (lang.code)}
          <Select.Item
            value={lang.code}
            label={lang.name}
            class="flex h-9 w-full select-none items-center gap-2 rounded-button px-2 text-sm outline-hidden data-highlighted:bg-muted"
          >
            {#snippet children({ selected: isSel })}
              <span class="truncate">{lang.name}</span>
              <span class="truncate text-muted-foreground">{lang.native}</span>
              {#if isSel}
                <Icon name="check" size={15} class="ml-auto shrink-0 text-foreground" />
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
    </Select.Content>
  </Select.Portal>
</Select.Root>
