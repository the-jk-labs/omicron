<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The tab bar for a page split into tabs (admin, settings). Goes inside a
     Bits UI Tabs.Root; each tab's panel is the caller's own Tabs.Content. -->
<script lang="ts">
  import { Tabs } from "bits-ui";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";

  let { tabs }: { tabs: readonly { value: string; label: string; icon: IconName }[] } = $props();

  const triggerClass =
    "data-[state=active]:bg-background data-[state=active]:shadow-mini text-muted-foreground data-[state=active]:text-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-button px-4 text-sm font-medium";
</script>

<!-- Scrolls sideways rather than overflowing the page on a narrow screen, with
     no scrollbar: a bar a few pixels long under the tabs read as broken. -->
<Tabs.List
  class="inline-flex max-w-full [scrollbar-width:none] items-center gap-1 overflow-x-auto rounded-input border border-input bg-background-alt p-1 shadow-btn [&::-webkit-scrollbar]:hidden"
>
  {#each tabs as t (t.value)}
    <Tabs.Trigger value={t.value} class={triggerClass}>
      <Icon name={t.icon} size={16} />
      {t.label}
    </Tabs.Trigger>
  {/each}
</Tabs.List>
