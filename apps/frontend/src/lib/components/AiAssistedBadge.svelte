<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { Popover } from "bits-ui";
  import Icon from "#lib/components/Icon.svelte";
</script>

<Popover.Root>
  <Popover.Trigger
    aria-label="AI-Assisted post information"
    class="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:bg-background focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-hidden"
  >
    <Icon name="sparkles" size={12} />
    AI-Assisted
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      sideOffset={6}
      class="z-30 max-w-64 rounded-card border border-border bg-background px-3 py-2 text-sm text-foreground shadow-popover focus-visible:outline-hidden"
    >
      This post was written with AI assistance.
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
