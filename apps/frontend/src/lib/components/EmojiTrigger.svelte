<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Popover } from "bits-ui";
  import Icon from "$lib/components/Icon.svelte";
  import EmojiPicker from "./EmojiPicker.svelte";

  // Reusable emoji-insert control: a smile button that opens the picker in a
  // popover and hands the picked Unicode emoji to `onPick`. Caret insertion is
  // left to the caller, since it differs per target (Tiptap vs. <textarea>).
  let {
    onPick,
    class: triggerClass = "",
    align = "end",
    label = "Emoji",
    iconSize = 18,
  }: {
    onPick: (emoji: string) => void;
    class?: string;
    align?: "start" | "center" | "end";
    label?: string;
    iconSize?: number;
  } = $props();

  let open = $state(false);

  function pick(emoji: string) {
    onPick(emoji);
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger class={triggerClass} aria-label={label} title={label}>
    <Icon name="smile" size={iconSize} />
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      sideOffset={8}
      {align}
      class="border-muted bg-background shadow-popover z-30 w-[22rem] max-w-[94vw] overflow-hidden rounded-card border focus-visible:outline-none"
    >
      <EmojiPicker onPick={pick} />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
