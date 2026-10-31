<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { DropdownMenu } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
  import { imageDisplay, type ImageDisplayPreference } from "#lib/imageDisplay.svelte.js";

  const options: { value: ImageDisplayPreference; label: string }[] = [
    { value: "system", label: "Follow reduced-motion setting" },
    { value: "show", label: "Show images" },
    { value: "hide", label: "Hide images" },
  ];
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    aria-label="Image display"
    title="Image display"
    class="inline-flex size-10 items-center justify-center rounded-full text-foreground hover:bg-muted"
  >
    <Icon name="image" size={18} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      sideOffset={8}
      align="end"
      class="z-30 w-72 rounded-xl border border-muted bg-background px-1 py-1.5 shadow-popover focus-visible:outline-hidden"
    >
      <DropdownMenu.RadioGroup
        value={imageDisplay.preference}
        onValueChange={(value) => imageDisplay.set(value as ImageDisplayPreference)}
        aria-label="Image display preference"
      >
        {#each options as option (option.value)}
          <DropdownMenu.RadioItem
            value={option.value}
            class="flex h-10 items-center rounded-button py-3 pr-1.5 pl-3 text-sm font-medium ring-0! ring-transparent! select-none focus-visible:outline-hidden data-highlighted:bg-muted"
          >
            {#snippet children({ checked })}
              {option.label}
              {#if checked}<Icon name="check" size={16} class="ml-auto" />{/if}
            {/snippet}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
      <DropdownMenu.Separator class="-mx-1 my-1 h-px bg-border" />
      <p class="px-3 py-2 text-xs text-muted-foreground">
        Hide all images to stop visible image animation. Screen readers still have image descriptions. This preference
        stays in this browser.
      </p>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
